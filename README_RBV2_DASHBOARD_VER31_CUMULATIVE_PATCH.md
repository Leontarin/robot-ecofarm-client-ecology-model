# RBV2 Dashboard cumulative patch — Ver31 sessions

This patch is meant for the shared Next.js project branch and updates only the Dashboard-related files.
It does not modify `src/app/data-analysis`.

## Main features included

- Greenhouse manager Dashboard redesign.
- Session selector from `src/session-data/session_*`.
- ROS2 Humble `slam_toolbox` map loading from saved session files:
  - `map.yaml`
  - `map.pgm`
- Robot route playback from `map_pose_timeline.jsonl`.
- Manual timeline bar instead of automatic playback.
- Detections appear progressively according to the selected timeline time.
- Tomato detection filters:
  - ripe tomato
  - unripe tomato / green tomato
  - ripe bunch
  - unripe bunch
  - strong detections
  - weak detections
- Click detection marker to show details in the side panel.
- Selected detection panel supports annotated frame paths when the session contains images.
- Top summary cards are smaller and placed in a collapsible scan overview panel.
- Summary includes:
  - total detections
  - ripe tomatoes
  - unripe tomatoes
  - ripe bunches
  - unripe bunches
  - strong / weak
  - first detection time
  - last detection time
  - estimated scanned distance
  - route points
- Left side panel includes:
  - Scan Playback
  - environment snapshot synchronized to the timeline
  - video panel
- Environment snapshot supports:
  - temperature
  - humidity
  - barometric pressure
  - gas / gas-change if exported by the session
- Video loader scans the session `videos` folder and prefers browser-friendly names such as:
  - `*_browser.mp4`
  - `*_h264.mp4`
  - `*_web.mp4`
  - `.webm`
- Includes the earlier JSONL/Git-LFS pointer fallback in `robotDebugData.js`.

## Files included in this patch

```text
src/app/dashboard/page.js
src/components/MapPanel.js
src/lib/api.js
src/lib/dashboardSessionMapData.js
src/lib/robotDebugData.js
src/app/api/map/route.js
src/app/api/dashboard-sessions/route.js
src/app/api/session-file/route.js
src/session-data/.gitkeep
```

## Expected session folder shape

Put sessions under:

```text
src/session-data/session_YYYYMMDD_HHMMSS/
```

Expected useful files:

```text
src/session-data/session_YYYYMMDD_HHMMSS/
├── map_overlay_summary.json
├── map_pose_timeline.jsonl
├── detections_on_map.jsonl
├── robot_timeline.jsonl
├── detection_events.jsonl
├── session_manifest.json
├── images_ok/
├── images_ok_raw/
├── images_weak_noise/
├── images_weak_noise_raw/
├── videos/
└── ros2_map/
    ├── latest_map.json
    └── map_session/
        └── session_.../
            ├── map.yaml
            └── map.pgm
```

## Video note

If the video exists but the browser shows:

```text
The element has no supported sources.
```

then the file probably uses an OpenCV `mp4v` codec. Convert it to H.264:

```powershell
ffmpeg -i ".\src\session-data\session_20260628_181444\videos\detection_video_20260628_181444.mp4" -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an ".\src\session-data\session_20260628_181444\videos\detection_video_20260628_181444_browser.mp4"
```

The Dashboard will automatically prefer the `*_browser.mp4` file.

## Install from PowerShell

From the project root:

```powershell
Expand-Archive -LiteralPath "$HOME\Downloads\robot_rco_dashboard_cumulative_ver2_patch.zip" -DestinationPath . -Force
npm run dev
```

## Git commit suggestion

```powershell
git status
git add src/app/dashboard/page.js src/components/MapPanel.js src/lib/api.js src/lib/dashboardSessionMapData.js src/lib/robotDebugData.js src/app/api/map/route.js src/app/api/dashboard-sessions/route.js src/app/api/session-file/route.js src/session-data/.gitkeep README_RBV2_DASHBOARD_VER31_CUMULATIVE_PATCH.md
git commit -m "Update greenhouse scan dashboard for RBV2 ver31 sessions"
git push
```
