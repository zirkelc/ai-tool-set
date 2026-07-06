# Changelog

## [2.3.0](https://github.com/zirkelc/ai-tool-set/compare/v2.2.0...v2.3.0) (2026-07-06)


### Features

* add tool ordering with .order() ([64c1b2d](https://github.com/zirkelc/ai-tool-set/commit/64c1b2dd378b577927b87e010691d4f4ae6d03e4))

## [2.2.0](https://github.com/zirkelc/ai-tool-set/compare/v2.1.0...v2.2.0) (2026-07-01)


### Features

* add tool choice with .choice() ([1aee055](https://github.com/zirkelc/ai-tool-set/commit/1aee055799a9c84cfd19eaf613e021ae424746b1))

## [2.1.0](https://github.com/zirkelc/ai-tool-set/compare/v2.0.0...v2.1.0) (2026-06-29)


### Features

* add steps to predicate and approval input ([cb43bd7](https://github.com/zirkelc/ai-tool-set/commit/cb43bd7e7e5c25ab2a6e07eb7747979690283dea))


### Documentation

* clarify AI SDK v7 requirement for tool approval ([64648c7](https://github.com/zirkelc/ai-tool-set/commit/64648c75afa898b5549c9559eeb3b0d7e2148da7))
* **examples:** rewrite examples on ai-test-kit ([faa8330](https://github.com/zirkelc/ai-tool-set/commit/faa83300fa6d3be34ed6dc8c9d74b6d8fd487654))


### Continuous Integration

* revert v1 dist-tag routing on main ([0f74379](https://github.com/zirkelc/ai-tool-set/commit/0f7437928be8d2aa140c632ff2238dda16d29259))
* route v1 releases to the v1 npm dist-tag ([756a6e2](https://github.com/zirkelc/ai-tool-set/commit/756a6e2ff69a67a80eef9c81797cdd3ba63402f8))

## [2.0.0](https://github.com/zirkelc/ai-tool-set/compare/v1.2.3...v2.0.0) (2026-06-26)


### ⚠ BREAKING CHANGES

* requires AI SDK v7 (ai@^7) and renames the runtime context to toolSetContext.

### Features

* ship AI SDK v7 support with conditional tool approval ([544ddcd](https://github.com/zirkelc/ai-tool-set/commit/544ddcd4a126a7341ca9d743d55437c462b8deee))


### Code Refactoring

* drop ApprovalResolver/ApprovalEntry from public exports ([9e99a47](https://github.com/zirkelc/ai-tool-set/commit/9e99a47d64b0a56841eda4ff4e5b70ecd000e544))


### Documentation

* refresh logo and banner assets ([ece2094](https://github.com/zirkelc/ai-tool-set/commit/ece209439f6b22a7d120fc763bc7d18630823a2b))

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
