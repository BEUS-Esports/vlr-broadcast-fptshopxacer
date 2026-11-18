# Redesign the current HUDs

STATUS: Done ([#13](https://github.com/BEUS-Esports/vlr-broadcast-fptshopxacer/pull/13)).

## Goal

- Redesign the HUD elements to match current designs.
- Scope included:

### "Fallback"/No-Provider HUD

- Uses the format shown [here](../../design_reference/ingame_images/hud-fallback/)
- Recommend to use the [FPT Shop Uni Tour 2024 HUD](../../design_reference/ingame_images/hud-fallback/fptShopUniTour24.png)
- In-Game Spectator layout is [here](../../design_reference/ingame_images/dirty/).

### Provider HUD

It is not required to implement the entire Provider HUD from scratch, starting from a base like:
    - GStack's [VCT 2022](../GStackHUD/HUD-2022/) and [VCT 2024](../GStackHUD/HUD-2024/) HUDs style,
    - nobiiVAL's [Spectra Frontend VCT26](../Spectra-Frontend-VAL26/) HUD style,

will be enough to avoid wasting too much time on them.

### Other consideration

- Camera boxes.
- 1v1 UI.

See [design_refernce/ingame_images/spectra](../../design_reference/ingame_images/spectra/).
