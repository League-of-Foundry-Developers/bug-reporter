# :bug: Bug Reporter

This module allows users to search for and sometimes create github/gitlab issues for a module or system within the foundry UI.

## Features
- Form will display a warning if the user is not up to date first.
- Any module or system with a compatible `bugs` url in the manifest will display a link to the module's github/gitlab issues list will be displayed.
- For opted-in modules, a form within Foundry will submit a bug report after first searching that package's issue list for similar matches.

![The Bug Submission Form](/form-flow.png)

## Info for Package Developers

### How do I opt in?
1. Have a url to a github or gitlab repository issues page in the `bugs` field of your manifest.
2. Add `allowBugReporter: true` to your manifest json.

#### Example:
```md
  "bugs": "https://github.com/Ethck/legendary-training-wheels/issues",
  "allowBugReporter": true
```

```md
  "bugs": "https://gitlab.com/Ethck/testing/-/issues",
  "allowBugReporter": true
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
