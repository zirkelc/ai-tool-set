# Changelog

## [1.5.0](https://github.com/zirkelc/ai-tool-set/compare/v1.4.0...v1.5.0) (2026-07-06)


### Features

* add tool ordering with .order() ([5098531](https://github.com/zirkelc/ai-tool-set/commit/50985314e77966d5398c06f1ae6a9abd84e89f29))

## [1.4.0](https://github.com/zirkelc/ai-tool-set/compare/v1.3.0...v1.4.0) (2026-07-01)


### Features

* add tool choice with .choice() ([c147463](https://github.com/zirkelc/ai-tool-set/commit/c14746361ccf4cf8b1e02ccd79ba79ccba7e660b))


### Continuous Integration

* publish the v1 line under the v1 dist-tag ([ae56a7a](https://github.com/zirkelc/ai-tool-set/commit/ae56a7a763b66c7d4a70cbb523e8d40e3025a313))
* use the `legacy` dist-tag for the v1 line ([fb332db](https://github.com/zirkelc/ai-tool-set/commit/fb332db198bf00c3a16a8554c94413e9ef3c18cc))

## [1.3.0](https://github.com/zirkelc/ai-tool-set/compare/v1.2.4...v1.3.0) (2026-06-29)


### Features

* add steps to the activation predicate input ([90a8887](https://github.com/zirkelc/ai-tool-set/commit/90a8887603a14a42c7c77459854b8210ae0b202e))


### Documentation

* align README conditional-activation wording with v2 ([5e87d4a](https://github.com/zirkelc/ai-tool-set/commit/5e87d4afcb002269282966bd05d25ee7c96d6338))

## [1.2.4](https://github.com/zirkelc/ai-tool-set/compare/v1.2.3...v1.2.4) (2026-06-29)


### Continuous Integration

* add release-please job for the v1 maintenance line ([c43e7e3](https://github.com/zirkelc/ai-tool-set/commit/c43e7e3ea36fc445eea2c32fdce2b27edc582477))

## [1.2.3](https://github.com/zirkelc/ai-tool-set/compare/v1.2.2...v1.2.3) (2026-06-26)


### Miscellaneous Chores

* add FUNDING.yml sponsor button ([ed4dbdb](https://github.com/zirkelc/ai-tool-set/commit/ed4dbdb0ea359a1e6f38dc66f7c99e4bf13231e9))

## [1.2.2](https://github.com/zirkelc/ai-tool-set/compare/v1.2.1...v1.2.2) (2026-06-23)


### Tests

* drive tool execution end-to-end in integration tests ([10a4af0](https://github.com/zirkelc/ai-tool-set/commit/10a4af0d0488f30e0ff65bbcb479899eb762f8a6))


### Miscellaneous Chores

* upgrade ai-test-kit to 2.0.0-next.2 ([341bab2](https://github.com/zirkelc/ai-tool-set/commit/341bab20c5eedf5eef7e645c145ba0e8e23ff7c1))

## [1.2.1](https://github.com/zirkelc/ai-tool-set/compare/v1.2.0...v1.2.1) (2026-06-23)


### Documentation

* add logo and banner assets, drop README heading ([b3d233c](https://github.com/zirkelc/ai-tool-set/commit/b3d233cda2be2da3ada547bb2cd64daca34f46d8))
* ramp tool colors grey to accent green ([2105c5c](https://github.com/zirkelc/ai-tool-set/commit/2105c5c274081f59fa7707a2bf7e42ccf07ff95d))
* ramp tool colors grey-to-white left to right ([53db10a](https://github.com/zirkelc/ai-tool-set/commit/53db10a595aa092731bfbc83542617e484c4ba63))
* switch accent to green and add spacing below logo mark ([8683c83](https://github.com/zirkelc/ai-tool-set/commit/8683c83298fbcbb4a5ebe7fd80cc84fbdb25691a))
* use JetBrains Mono for banner tagline ([d3279e1](https://github.com/zirkelc/ai-tool-set/commit/d3279e1483a943efb7d778d0672d7c0620ca24a2))


### Tests

* rewrite tests with ai-test-kit helpers ([9a5552d](https://github.com/zirkelc/ai-tool-set/commit/9a5552d01194a53a9dd56a782c5d04414df50009))


### Continuous Integration

* add release-please flow with next prerelease line ([23e6196](https://github.com/zirkelc/ai-tool-set/commit/23e61967e7796543f0e1c5f629eb8418a098289f))


### Miscellaneous Chores

* apply oxfmt formatting ([6d056c0](https://github.com/zirkelc/ai-tool-set/commit/6d056c0002df2be8e7c984b370dad3ec1e96dbef))
* upgrade ai-test-kit to 1.2.0 ([a261ac9](https://github.com/zirkelc/ai-tool-set/commit/a261ac97e6ad142a9cced4303190d20ed3b2e42b))

## [1.2.0](https://github.com/zirkelc/ai-tool-set/compare/v1.1.0...v1.2.0) (2026-05-05)

### Features

- add InferAllTools type helper ([1f89ecb](https://github.com/zirkelc/ai-tool-set/commit/1f89ecb1d21818e3f19e94937b01e9f9efe3f93d))

## [1.1.0](https://github.com/zirkelc/ai-tool-set/compare/v1.0.0...v1.1.0) (2026-04-22)

### Features

- add ToolSet type helper for immutable or mutable instances ([c24d877](https://github.com/zirkelc/ai-tool-set/commit/c24d877fbb42737c89075fa8b785e2fd33e328c1))

### Bug Fixes

- widen AnyToolSet constraint for custom MESSAGE/CONTEXT ([b0f8cee](https://github.com/zirkelc/ai-tool-set/commit/b0f8cee55c0eb8409e026922f47f743faf98737b))
