/**
 * Spades LLM Arena — FFmpeg RTMP Streaming Helper
 *
 * Receives JPEG frames via stdin pipe from the orchestrator's CDP screencast
 * and streams them to YouTube Live via RTMP using FFmpeg.
 *
 * Automatically selects the best encoder for the platform:
 *   macOS  → h264_videotoolbox (Apple silicon media engine, near-zero CPU)
 *   NVIDIA → h264_nvenc        (Jetson Orin / desktop GPU)
 *   Linux  → libx264            (software fallback)
 *
 * This module is only used when YOUTUBE_STREAM_KEY is set.
 */

import { spawn, execSync, type ChildProcess } from 'child_process';
import type { Writable } from 'stream';

export interface FFmpegConfig {
    width: number;          // Viewport width
    height: number;         // Viewport height
    youtubeStreamKey: string;
    framerate?: number;     // Default: 30
    videoBitrate?: string;  // Default: '6000k' (1440p quality)
    audioBitrate?: string;  // Default: '128k'
    preset?: string;        // Encoder preset override (optional)
    forceEncoder?: string;  // Force a specific encoder (optional)
}

let ffmpegProcess: ChildProcess | null = null;

function log(msg: string) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [ffmpeg] ${msg}`);
}

function logError(msg: string) {
    const ts = new Date().toISOString();
    console.error(`[${ts}] [ffmpeg] ❌ ${msg}`);
}

// ─── Encoder Detection ──────────────────────────────────────

interface EncoderChoice {
    codec: string;
    presetArgs: string[];
    label: string;
}

/**
 * Detect the best available hardware encoder for the current platform.
 * Falls back to libx264 if no hardware encoder is found.
 */
function detectBestEncoder(bitrateStr: string, framerate: number): EncoderChoice {
    // macOS: Apple VideoToolbox (M-series and Intel with T2)
    if (process.platform === 'darwin') {
        if (hasEncoder('h264_videotoolbox')) {
            return {
                codec: 'h264_videotoolbox',
                presetArgs: [
                    '-realtime', '1',
                    '-allow_sw', '0',         // Force HW only
                    '-prio_speed', '1',
                ],
                label: 'Apple VideoToolbox (hardware)',
            };
        }
    }

    // Linux / Jetson: NVIDIA NVENC
    if (hasEncoder('h264_nvenc')) {
        return {
            codec: 'h264_nvenc',
            presetArgs: [
                '-preset', 'p4',              // Balanced speed/quality
                '-tune', 'll',                // Low latency
                '-rc', 'cbr',                 // Constant bitrate for streaming
                '-b:v', bitrateStr,
                '-gpu', '0',
            ],
            label: 'NVIDIA NVENC (hardware)',
        };
    }

    // Linux: VAAPI (Intel/AMD iGPU)
    if (hasEncoder('h264_vaapi')) {
        return {
            codec: 'h264_vaapi',
            presetArgs: [
                '-vaapi_device', '/dev/dri/renderD128',
            ],
            label: 'VAAPI (hardware)',
        };
    }

    // Fallback: software x264
    return {
        codec: 'libx264',
        presetArgs: [
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
        ],
        label: 'libx264 (software — expect higher CPU)',
    };
}

/**
 * Check if FFmpeg has a specific encoder compiled in.
 */
function hasEncoder(name: string): boolean {
    try {
        const output = execSync(`ffmpeg -hide_banner -encoders 2>/dev/null | grep ${name}`, {
            encoding: 'utf-8',
            timeout: 5000,
        });
        return output.includes(name);
    } catch {
        return false;
    }
}

// ─── Stream Management ──────────────────────────────────────

/**
 * Start the FFmpeg process.
 * Returns the writable stdin stream so the orchestrator can pipe JPEG frames in.
 */
export function startFFmpegStream(config: FFmpegConfig): Writable | null {
    if (ffmpegProcess) {
        log('FFmpeg is already running — skipping start.');
        return ffmpegProcess.stdin as Writable;
    }

    const {
        width,
        height,
        youtubeStreamKey,
        framerate = 30,
        videoBitrate = '6000k',
        audioBitrate = '128k',
        forceEncoder,
    } = config;

    const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${youtubeStreamKey}`;

    // Detect the best encoder
    let encoder: EncoderChoice;
    if (forceEncoder) {
        encoder = {
            codec: forceEncoder,
            presetArgs: [],
            label: `${forceEncoder} (forced)`,
        };
    } else {
        encoder = detectBestEncoder(videoBitrate, framerate);
    }

    // Build FFmpeg arguments
    const args: string[] = [
        // Input: JPEG frames piped from Playwright CDP screencast
        '-f', 'image2pipe',
        '-codec:v', 'mjpeg',
        '-framerate', framerate.toString(),
        '-i', 'pipe:0',

        // Silent audio source (YouTube requires an audio stream)
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',

        // Video encoding (platform-specific)
        '-c:v', encoder.codec,
        ...encoder.presetArgs,
        '-maxrate', videoBitrate,
        '-bufsize', `${parseInt(videoBitrate) * 2}k`,
        '-pix_fmt', 'yuv420p',
        '-g', (framerate * 2).toString(), // Keyframe every 2 seconds
        '-video_size', `${width}x${height}`,

        // Audio encoding
        '-c:a', 'aac',
        '-b:a', audioBitrate,

        // Output to RTMP
        '-f', 'flv',
        '-shortest',
        rtmpUrl,
    ];

    log(`Starting FFmpeg stream to YouTube...`);
    log(`  Resolution: ${width}x${height} @ ${framerate}fps`);
    log(`  Encoder:    ${encoder.label}`);
    log(`  Bitrate:    ${videoBitrate} video / ${audioBitrate} audio`);
    log(`  Input:      stdin pipe (JPEG frames from CDP screencast)`);
    log(`  RTMP URL:   rtmp://a.rtmp.youtube.com/live2/****`);

    ffmpegProcess = spawn('ffmpeg', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    ffmpegProcess.stdout?.on('data', (_data: Buffer) => { });

    ffmpegProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        if (output.includes('error') || output.includes('Error') ||
            output.includes('Opening') || output.includes('Stream mapping') ||
            output.includes('Output #0') || output.includes('frame=')) {
            if (output.includes('frame=')) {
                const match = output.match(/frame=\s*(\d+)/);
                if (match && parseInt(match[1]) % 150 === 0) {
                    log(output.substring(0, 140));
                }
            } else {
                log(output);
            }
        }
    });

    ffmpegProcess.on('error', (err) => {
        logError(`FFmpeg process error: ${err.message}`);
        logError('Make sure FFmpeg is installed: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)');
        ffmpegProcess = null;
    });

    ffmpegProcess.on('exit', (code, signal) => {
        if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') {
            logError(`FFmpeg exited with code ${code}, signal ${signal}`);
        } else {
            log(`FFmpeg stopped (code ${code})`);
        }
        ffmpegProcess = null;
    });

    log('✓ FFmpeg process launched');
    return ffmpegProcess.stdin as Writable;
}

/**
 * Get the stdin writable stream (if FFmpeg is running).
 */
export function getFFmpegStdin(): Writable | null {
    return ffmpegProcess?.stdin as Writable | null;
}

/**
 * Write a single JPEG frame buffer to FFmpeg's stdin.
 */
export function writeFrame(jpegBuffer: Buffer): boolean {
    if (!ffmpegProcess || !ffmpegProcess.stdin) return false;
    try {
        return ffmpegProcess.stdin.write(jpegBuffer);
    } catch {
        return false;
    }
}

/**
 * Gracefully stop the FFmpeg process.
 */
export function stopFFmpegStream(): void {
    if (ffmpegProcess) {
        log('Closing FFmpeg stdin and sending SIGTERM...');
        try { ffmpegProcess.stdin?.end(); } catch { /* ignore */ }
        ffmpegProcess.kill('SIGTERM');

        setTimeout(() => {
            if (ffmpegProcess) {
                log('Force-killing FFmpeg...');
                ffmpegProcess.kill('SIGKILL');
                ffmpegProcess = null;
            }
        }, 5000);
    }
}

/**
 * Check if FFmpeg is currently running.
 */
export function isFFmpegRunning(): boolean {
    return ffmpegProcess !== null;
}
