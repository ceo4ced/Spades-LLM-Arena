/**
 * Spades LLM Arena — FFmpeg RTMP Streaming Helper
 *
 * Captures the Xvfb virtual display and streams it to YouTube Live
 * via RTMP using FFmpeg. Designed to run alongside the orchestrator.
 *
 * This module is only used when YOUTUBE_STREAM_KEY is set.
 * On macOS (local dev), it can capture using avfoundation instead of x11grab.
 */

import { spawn, type ChildProcess } from 'child_process';

export interface FFmpegConfig {
    display: string;        // X11 display, e.g. ':99'
    width: number;          // Viewport width
    height: number;         // Viewport height
    youtubeStreamKey: string;
    framerate?: number;     // Default: 30
    videoBitrate?: string;  // Default: '3000k'
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
 * Start the FFmpeg process to capture the display and stream to YouTube.
 */
export function startFFmpegStream(config: FFmpegConfig): void {
    if (ffmpegProcess) {
        log('FFmpeg is already running — skipping start.');
        return;
    }

    const {
        display,
        width,
        height,
        youtubeStreamKey,
        framerate = 30,
        videoBitrate = '3000k',
        audioBitrate = '128k',
        preset = 'veryfast',
    } = config;

    const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${youtubeStreamKey}`;

    // Build FFmpeg arguments
    const args: string[] = [];

    if (process.platform === 'linux') {
        // X11 screen capture (Xvfb)
        args.push(
            '-f', 'x11grab',
            '-video_size', `${width}x${height}`,
            '-framerate', framerate.toString(),
            '-i', display,
        );
    } else if (process.platform === 'darwin') {
        // macOS: avfoundation screen capture
        // Use device name for reliability (run `ffmpeg -f avfoundation -list_devices true -i ""` to list)
        args.push(
            '-f', 'avfoundation',
            '-framerate', framerate.toString(),
            '-capture_cursor', '1',
            '-i', 'Capture screen 0:none',
        );
    } else {
        // Windows: gdigrab (untested)
        args.push(
            '-f', 'gdigrab',
            '-framerate', framerate.toString(),
            '-i', 'desktop',
        );
    }

    // Silent audio source (YouTube requires audio)
    args.push(
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    );

    // Video encoding
    args.push(
        '-c:v', 'libx264',
        '-preset', preset,
        '-maxrate', videoBitrate,
        '-bufsize', `${parseInt(videoBitrate) * 2}k`,
        '-pix_fmt', 'yuv420p',
        '-g', (framerate * 2).toString(), // Keyframe every 2 seconds
    );

    // Audio encoding
    args.push(
        '-c:a', 'aac',
        '-b:a', audioBitrate,
    );

    // Output to RTMP
    args.push(
        '-f', 'flv',
        '-shortest',
        rtmpUrl,
    );

    log(`Starting FFmpeg stream to YouTube...`);
    log(`  Resolution: ${width}x${height} @ ${framerate}fps`);
    log(`  Bitrate:    ${videoBitrate} video / ${audioBitrate} audio`);
    log(`  Preset:     ${preset}`);
    log(`  RTMP URL:   rtmp://a.rtmp.youtube.com/live2/****`);

    ffmpegProcess = spawn('ffmpeg', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    ffmpegProcess.stdout?.on('data', (data: Buffer) => {
        // FFmpeg outputs progress to stderr, stdout is rarely used
    });

    ffmpegProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        // Only log important FFmpeg messages, not the frame-by-frame progress
        if (output.includes('error') || output.includes('Error') ||
            output.includes('Opening') || output.includes('Stream mapping') ||
            output.includes('Output #0')) {
            log(output);
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
}

/**
 * Gracefully stop the FFmpeg process.
 */
export function stopFFmpegStream(): void {
    if (ffmpegProcess) {
        log('Sending SIGTERM to FFmpeg...');
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
