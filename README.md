# :bug: Bug Reporter

![Latest Release Download Count](https://img.shields.io/badge/dynamic/json?label=Downloads@latest&query=assets%5B1%5D.download_count&url=https%3A%2F%2Fapi.github.com%2Frepos%2FLeague-of-Foundry-Developers%2Fbug-reporter%2Freleases%2Flatest)
![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fbug-reporter&colorB=4aa94a)
![Foundry Core Compatible Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2FLeague-of-Foundry-Developers%2Fbug-reporter%2Fmaster%2FModule%2Fmodule.json&label=Foundry%20Version&query=$.compatibleCoreVersion&colorB=orange)

This module allows users to search for and sometimes create github/gitlab issues for a module or system within the foundry UI.

## Features
- Form will display a warning if the user is not up to date first.
- Any module or system with a compatible `bugs` url in the manifest will display a link to the module's github/gitlab issues list will be displayed.
- For opted-in modules, a form within Foundry will submit a bug report after first searching that package's issue list for similar matches.

![The Bug Submission Form](/form-flow.png)

## Info for Package Developers

### How do I opt in?
1. Have a url to a github or gitlab repository issues page in the `bugs` field of your manifest.
2. Add `allowBugReporter: true` to your manifest json. In versions BEFORE 0.8.3 (broken in 0.8.2) of Foundry you can put `allowBugReporter` at the root of the manifest, but starting with 0.8.3 it needs to be inside of the `flags` field of the manifest.

#### Examples:

Github
```md
  "bugs": "https://github.com/Ethck/legendary-training-wheels/issues",
  "allowBugReporter": true
```

Gitlab
```md
  "bugs": "https://gitlab.com/Ethck/testing/-/issues",
  "allowBugReporter": true
```

0.8.3+
```md
  "bugs": "https://github.com/Ethck/legendary-training-wheels/issues",
  "flags": {
    "allowBugReporter": true
  }
```

### Bug Reporter API

As of Bug Reporter version 1.3.1 there is now an API that a developer can launch and pre-fill with data for bug reports.

The API can be accessed as follows:

```js
game.modules.get("bug-reporter").api;
```

In the API you will find the following methods available for your use:

- allowBugReporter(modid)
- bugWorkflow(modid, title = "", details = "")

#### allowBugReporter()

allowBugReporter takes a string of the module name and returns whether or not the module in question supports Bug Reporter.

#### bugWorkflow()
bugWorkflow takes the modid and option title & details to generate a bug report that will be prefilled with the details of the bug that you provide. These details can be formatted however you desire, but it will be wrapped inside of <summary> tags on transmission to Github/lab.

Example:
```js
game.modules.get("bug-reporter").api.bugWorkflow("bug-reporter", "Testing the API", "Here are my auto-generated details, perhaps even an error message");
```

#### Rationale:
> Why are you leveraging an arbitrary, unofficial field on the Manifest instead of providing an API for modules to register themselves?

There is no functional difference between a package which has bug reporter opt-in and one which doesn't. Thus we decided to use a manifest field rather than ask packages to register via API. Some packages might not even register JS at all, such a mechanism would dramatically increase the friction for opting into this service, where a simple manifest field does not.

Being able to report a bug to a compendium package or a css package makes just as much sense as one with JS.


### How does it work?

The module looks at all activated modules and the system which have both `allowBugReporter: true` and a `bugs` field which meets the following criteria in the manifest:
1. is a Github or Gitlab repo
2. ends in `/issues`

If both of these are met, the form is submittable to our API endpoint which first runs some sanity checks against malicious intent before submitting the issue via Github's/Gitlab's API. All of the bugs submitted will come from the [`leagueoffoundryvttdevs`](https://github.com/leagueoffoundryvttdevs) account on Github, or from the [`leagueoffvttdevs`](https://gitlab.com/leagueoffvttdevs) account on Gitlab.



Huge thanks to Moo Man for their work on the Bug Reporter for their WFRP4e FVTT system. This work is inspired by Moo Man's work.
