/**
 * Spades LLM Arena — FFmpeg RTMP Streaming Helper
 *
 * Receives JPEG frames via stdin pipe from the orchestrator's CDP screencast
 * and streams them to YouTube Live via RTMP using FFmpeg.
 *
 * This approach captures ONLY the browser viewport (not the entire screen)
 * and works identically on macOS, Linux, and Windows.
 *
 * This module is only used when YOUTUBE_STREAM_KEY is set.
 */

import { spawn, type ChildProcess } from 'child_process';
import type { Writable } from 'stream';

export interface FFmpegConfig {
    width: number;          // Viewport width
    height: number;         // Viewport height
    youtubeStreamKey: string;
    framerate?: number;     // Default: 30
    videoBitrate?: string;  // Default: '6000k' (bumped for 1440p)
    audioBitrate?: string;  // Default: '128k'
    preset?: string;        // x264 preset. Default: 'veryfast'
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
        preset = 'veryfast',
    } = config;

    const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${youtubeStreamKey}`;

    // Build FFmpeg arguments — reading JPEG frames from stdin pipe
    const args: string[] = [
        // Input: JPEG frames piped in from Playwright CDP screencast
        '-f', 'image2pipe',
        '-codec:v', 'mjpeg',
        '-framerate', framerate.toString(),
        '-i', 'pipe:0',

        // Silent audio source (YouTube requires an audio stream)
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',

        // Video encoding
        '-c:v', 'libx264',
        '-preset', preset,
        '-tune', 'zerolatency',
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
    log(`  Bitrate:    ${videoBitrate} video / ${audioBitrate} audio`);
    log(`  Preset:     ${preset}`);
    log(`  Input:      stdin pipe (JPEG frames from CDP screencast)`);
    log(`  RTMP URL:   rtmp://a.rtmp.youtube.com/live2/****`);

    ffmpegProcess = spawn('ffmpeg', args, {
        stdio: ['pipe', 'pipe', 'pipe'],  // stdin writable for frame piping
    });

    ffmpegProcess.stdout?.on('data', (_data: Buffer) => {
        // FFmpeg outputs progress to stderr, stdout is rarely used
    });

    ffmpegProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        // Only log important FFmpeg messages, not the frame-by-frame progress
        if (output.includes('error') || output.includes('Error') ||
            output.includes('Opening') || output.includes('Stream mapping') ||
            output.includes('Output #0') || output.includes('frame=')) {
            // Rate-limit frame= progress lines
            if (output.includes('frame=')) {
                // Only log every ~5 seconds worth of frames
                const match = output.match(/frame=\s*(\d+)/);
                if (match && parseInt(match[1]) % 150 === 0) {
                    log(output.substring(0, 120));
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

    log('✓ FFmpeg process launched (waiting for frames on stdin)');
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

        // Close stdin first to signal end-of-stream
        try {
            ffmpegProcess.stdin?.end();
        } catch { /* ignore */ }

        ffmpegProcess.kill('SIGTERM');

        // Force kill after 5 seconds if it hasn't stopped
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
