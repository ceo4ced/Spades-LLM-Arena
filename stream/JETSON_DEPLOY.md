# Jetson Orin Nano — 24/7 YouTube Streaming Setup

Deploy the Spades LLM Arena as a headless YouTube live stream on your NVIDIA Jetson Orin Nano (8GB).

## Prerequisites

| Component | Version |
|---|---|
| JetPack | 6.0+ (Ubuntu 22.04 based) |
| Node.js | 20 LTS |
| FFmpeg | 6.0+ (with NVENC support) |
| Chromium | via Playwright |

## 1. System Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Xvfb (virtual display for headless browser)
sudo apt install -y xvfb

# Install FFmpeg with NVIDIA support
# JetPack includes NVENC — verify with:
ffmpeg -hide_banner -encoders 2>/dev/null | grep nvenc
# Should show: h264_nvenc

# If not present, install the Jetson-optimized build:
sudo apt install -y ffmpeg
```

## 2. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v  # Should show v20.x
```

## 3. Clone and Install

```bash
git clone https://github.com/ceo4ced/Spades-LLM-Arena.git
cd Spades-LLM-Arena
npm install
npx playwright install chromium --with-deps
```

## 4. Configure Environment

```bash
cp .env.example .env.local
nano .env.local
```

Set your YouTube stream key:
```
YOUTUBE_STREAM_KEY=your-youtube-stream-key-here
```

## 5. Run the Stream

```bash
# Test locally first (headless, no YouTube)
HEADLESS=1 npm run stream

# Go live on YouTube
HEADLESS=1 npm run stream:live
```

The orchestrator will automatically:
1. Start Xvfb virtual display (2560×1440)
2. Boot the Vite dev server
3. Launch headless Chromium
4. Auto-select `h264_nvenc` hardware encoder
5. Begin streaming to YouTube via RTMP
6. Auto-restart matches forever

## 6. Run as a systemd Service (24/7)

Create `/etc/systemd/system/spades-stream.service`:

```ini
[Unit]
Description=Spades LLM Arena YouTube Stream
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=jetson
WorkingDirectory=/home/jetson/Spades-LLM-Arena
Environment=HEADLESS=1
Environment=YOUTUBE=1
ExecStart=/usr/bin/npm run stream:live
Restart=always
RestartSec=30

# Resource limits (optional)
MemoryMax=6G
CPUQuota=80%

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable spades-stream
sudo systemctl start spades-stream

# Check status
sudo systemctl status spades-stream
journalctl -u spades-stream -f   # Live logs
```

## Performance Tuning

| Setting | Recommended | Notes |
|---|---|---|
| Resolution | `2560x1440` | NVENC handles this easily |
| Framerate | `30` | Smooth for card game |
| Video bitrate | `6000k` | YouTube 1440p recommendation |
| Encoder | Auto-detected `h264_nvenc` | ~5% GPU, near-zero CPU |
| JPEG quality | `85` | Good balance of quality/bandwidth |

> [!TIP]
> If you experience memory pressure, set the viewport to `1920x1080` in `stream/orchestrator.ts` and lower the bitrate to `4500k`. The Orin Nano has 8GB shared between CPU and GPU.

## Monitoring

```bash
# GPU utilization (should show NVENC active)
sudo tegrastats

# Stream health
journalctl -u spades-stream --since "5 minutes ago"
```

## Troubleshooting

| Issue | Fix |
|---|---|
| `h264_nvenc` not found | Ensure JetPack 6.0+ is installed: `cat /etc/nv_tegra_release` |
| Chromium crash on launch | Add swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
| RTMP connection refused | Verify YouTube stream key and that your YouTube channel has live streaming enabled |
| Low FPS in logs | Check `sudo tegrastats` — if GPU memory is full, lower resolution to 1080p |
