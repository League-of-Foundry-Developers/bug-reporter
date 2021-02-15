# League of Foundry VTT Developers Bug Reporter

This module allows users to search for and sometimes create github issues for a module within the foundry UI.

## Features
- Form will display a warning if the user is not up to date first.
- Any module with a compatible `bugs` url in the manifest will allow searching that module's issue list for matching titles.
- For opted-in modules, a form within Foundry will submit a bug report.
- For non-opted-in modules, a link to the module's github issues list will be displayed.

![The Bug Submission Form](/form-flow.png)

## Info for Package Developers

### How do I opt in?
1. Have a url to a github repository issues page in the `bugs` field of your manifest.
2. Add `allowBugReporter: true` to your manifest json.

#### Example:
```md
  "bugs": "https://github.com/Ethck/legendary-training-wheels/issues",
  "allowBugReporter": true
```

### How does it work?

The module looks at all activated modules which have both `allowBugReporter: true` and a `bugs` field which meets the following criteria in the manifest:
1. is a Github repo
2. ends in `/issues`

If both of these are met, the form is submittable to our API endpoint which first runs some sanity checks against malicious intent before submitting the issue via Github's API. All of the bugs submitted will come from the [`leagueoffoundryvttdevs`](https://github.com/leagueoffoundryvttdevs) account.



Huge thanks to Moo Man for their work on the Bug Reporter for their WFRP4e FVTT system. This work is inspired by Moo Man's work.
