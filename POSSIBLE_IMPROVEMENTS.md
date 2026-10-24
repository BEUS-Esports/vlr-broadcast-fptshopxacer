# Possible improvements, i guess?

1. Server logging — implemented: shared TSLog terminal output, optional rotating JSONL files, request correlation, safe provider diagnostics, mutation requests, post-game outcomes, resource sync and asset cleanup. Set `LOG_DIR` to retain files and `LOG_LEVEL=debug` to include successful reads/polling. See the README logging guide.
2. Authentication via Discord/classic Email + Password and User management route in the admin
3. Turn the GFX route to an SPA
4. Write Preload functions for all assets to avoid asset loading during GFX is on air.
5. A single Workspace for controlling all graphics on air (PVW/PGM style) (? debatable, but useful for vMix where its browser source is too old and can lag even the strongest machines)
6. Docker
7. (anything that can be added for improvements to workflow or data fetching or just about anything)
