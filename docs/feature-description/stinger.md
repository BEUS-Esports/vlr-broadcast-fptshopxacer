# Stinger Support

## Goal

- Add Stinger support for the graphics.
- Allow customizing the stinger:
    1. Duration: Specify the total duration of the animation in milliseconds or frames. This will usually be the length of the animation.
    2. Stinger Input: Select the Input added in step 1
    3. Stinger Cut Point: Specify the point in time when the transition will cut between the Preview and Output inputs. If your animation has alpha channel, this will usually be the point where the animation covers the entire screen.

- Support for MOV, WebP with Transparency, AVIF with transparency (if the browser can even handle it lol)
  - Prerequisite: Stinger upload must be able to support heavy files. Expect file size to be at least 250MB for MOV.

## Inspiration

- [vMix's Stinger Transition](https://www.vmix.com/help30/StingerTransitions.html)
- [Custom LeagueBroadcast GFX App, built for the LoL Predator League Roadshow 2026](https://github.com/quan1212do/repo-bluebottle-app)
  - <https://github.com/quan1212do/repo-bluebottle-app/blob/main/examples/leaguebroadcast-js-client-demo-main/src/components/StingerControl.vue>
  - <https://github.com/quan1212do/repo-bluebottle-app/blob/main/examples/leaguebroadcast-js-client-demo-main/src/components/Graphics/StingerPlayer.vue>