
// Namespaced isEmpty handlebars helper for testing if
// a given input is does not contain additional values
Handlebars.registerHelper('bugs-isEmpty', (input) => {
  if (!input) {
    return true;
  }
  if (input instanceof Array) {
    return input.length < 1;
  }
  if (input instanceof Set) {
    return input.size < 1;
  }
  return isObjectEmpty(input);
});

/**
 * Generate a list of active modules to append as an
 * additional description to bug reports.
 * @param  {String} separator     Separator between module name and version
 * @param  {String} versionMarker version prefix
 * @return {String}               Markdown formatted collapsible list of active modules
 */
const generateActiveModuleList = (separator = "--", versionMarker = "v") => {
    let schema = `<details>\n<summary>Active Modules</summary>\n{REPL_MODULES}\n</details>`;
    let data = [];
    let activeModules = [...game.modules].filter(([name, opts]) => opts.active);
    activeModules.forEach(([name, opts]) => data = [...data, `${name}${separator}${versionMarker}${opts.data.version};`]);
    return schema.replace(/{REPL_MODULES}/gi, data.join("\n"));
}

/**
 * For a given module determine all settings that are bound
 * to its scope, collect them, and format them. This only
 * keeps scalars to prevent mile long descriptions.
 * 
 * @param  {module} mod Module data as retrived from game.modules.get()
 * @return {String}     Markdown formatted collapsible list of settings.
 */
const generateModuleSettings = (mod) => {
  // Find all keys in settings that belong to our module
  let modSettings = [];
  game.settings.settings.forEach((setting) => {
    if (setting.module === mod.data.name) {
      // only allow scalars
      if (setting.config && setting.type !== "object") {
        let trimmedKey = setting.key.replace("-", "").replace("_", "").replace(" ", "").toLowerCase();
        const ignore = ["cookie", "password", "secret", "token", "bearer", "email"].some(badKey => trimmedKey.includes(badKey));
        if (!ignore){
          let setVal = game.settings.get(mod.data.name, setting.key);
          modSettings.push(`${setting.key}: ${setVal}`);
        }
      }
    }
  })
  // collapsible field for module settings
  const schema = `<details>\n<summary>Module Settings</summary>\n\n\`\`\`js\n${modSettings.join(",\n")}\n\`\`\`\n</details>\n`;

  return schema;
}


/**
 * Based off of Moo Man's Excellent WFRP4e Bug Reporter
 * https://github.com/moo-man/WFRP4e-FoundryVTT/blob/master/modules/apps/bug-report.js
 */
class BugReportForm extends FormApplication {
  constructor(app, { selectedModule }) {
    super(app);
    this.endpoint = "https://foundryvttbugreporter.azurewebsites.net/api/ReportBugFunction?code=VCvrWib1lha2nf9Pza7fOaThNTksbmHdEjVhIudCHwXg3zyg4vPprg==";
    this.module = game.modules.get(selectedModule) || game.system;
    this.github = this.module.data.bugs.includes("github");
    this.gitlab = this.module.data.bugs.includes("gitlab");

    this.useBugReporter = this.module.data.allowBugReporter && (this.github || this.gitlab);

    this.formFields = {
      bugTitle: '',
      issuer: '',
      issueLabel: '',
      bugDescription: '',
    }

    this.foundIssues = [];

    this.isSending = false; // true while waiting for server response
    this.submittedIssue = undefined;
  }

  // helper for rendering spinner
	get isEditable() {
	  return this.options.editable && !this.isSending && !this.submittedIssue;
  }

  // render options for our FormApplication
  static get defaultOptions() {
    const options = {
      ...super.defaultOptions,
      closeOnSubmit: false,
      classes: ['bug-report'],
      submitOnChange: false,
      submitOnClose: false,
      id: "bug-report",
      template: "modules/bug-reporter/templates/bug-report.html",
      height: 'auto',
      width: 600,
      minimizable: true,
      title: "Post Your Bugs",
    };
    return options;
  }

  /**
   * bugs endpoint is the html version for Github
   * and the api version for Gitlab
   * search endpoint is the api version for Github
   * and the html version for Gitlab
   *
   * This is due to the server using a Github library
   * but not a Gitlab library (for ease of use)
   *
   * SPEC: https://docs.github.com/en/rest/reference/issues
   * SPEC: https://docs.gitlab.com/ee/api/issues.html
   *
   * @return {object} Dictionary containing bugs and search urls
   */
  get endpoints() {
    let bugs, search;
    // Github
    if (this.github) {
      // https://github.com/user/repo/issues
      const regex = /github.com\/(.+)\/issues/g;

      const match = regex.exec(this.module.data.bugs);

      const repo = match?.[1].toLowerCase();

      bugs = this.module.data.bugs;
      search = `https://api.github.com/search/issues?q=repo:${repo}`;
    // Gitlab
    } else if (this.gitlab) {
      // https://gitlab.com/user/repo/-/issues
      const regex = /gitlab.com\/(.+)\/-\/issues/g;

      const match = regex.exec(this.module.data.bugs);

      const repo = match?.[1].toLowerCase();

      bugs = `https://gitlab.com/api/v4/projects/${encodeURIComponent(repo)}/issues`;
      search = bugs;
    }

    return { bugs: bugs, search: search };
  }

  /**
   * Search our module's manifest for any known conflicts
   * For each conflict determine if the conflict is based
   * on a certain version, or if the conflict is with the
   * module in general.
   *
   * SPEC: https://foundryvtt.wiki/en/development/manifest-plus#conflicts
   * 
   * @return {object} conflicts, version, update status
   */
  get conflicts() {
    return this.module.data.conflicts?.map((conflict) => {
      const mod = game.modules.get(conflict.name);
      let conflictingVersion = false;
      let versionChecks = false;
      // Check if utilizing option versionMin / versionMax fields
      if ("versionMin" in conflict && "versionMax" in conflict) {
        versionChecks = true;
        // find if current module version is within the versionMin and versionMax fields
        if (isNewerVersion(mod.data.version, conflict.versionMin) && !isNewerVersion(mod.data.version, conflict.versionMax)) {
          conflictingVersion = true;
        }
      } else {
        versionChecks = false;
      }

      return {
        name: mod.data.title,
        active: mod.active,
        version: mod.data.version,
        conflictingVersion,
        versionChecks,
      }
    })
  }

  /**
   * Search the module's manifest for known dependencies
   * and determine if they are up to date or not.
   *
   * SPEC: https://foundryvtt.com/article/module-development/
   * 
   * @return {object} dependencies, their version, and update status
   */
  get dependencies() {
    return this.module.data.dependencies?.map((dependency) => {
      const mod = game.modules.get(dependency.name);
      let upToDate;
      // get remote manifest
      let remote = this.checkVer(mod);
      // determine status
      if (!isNewerVersion(remote.manifest?.version, mod.data.version)) {
        // we are up to date
        upToDate = true;
      } else {
        // update required
        upToDate = false;
      }
      // assemble return
      return {
        name: mod.data.title,
        active: mod.active,
        version: mod.data.version,
        upToDate
      }
    })
  }

  /**
   * Data supplied to the handlebars template when it is rendered
   * conflicts, dependencies, and isSending are get methods that are
   * automaticall called when their respective properties are accessed
   * 
   * @return {object} combined object for handlebars template to use
   */
  getData() {
    let data = {
      ...super.getData(), 
      conflicts: this.conflicts,
      contactInfo: game.settings.get("bug-reporter", "contactInfo"),
      dependencies: this.dependencies,
      formFields: this.formFields,
      foundIssues: this.foundIssues,
      isSending: this.isSending,
      module: this.module,
      submittedIssue: this.submittedIssue,
      useBugReporter: this.useBugReporter,
      // if core version > 0.7.10 (like 0.8.X)
      unsupportedCore: isNewerVersion(game.data.version, "0.7.10"),
    };

    return data;
  }

  /**
   * override
   * Calls search when we change away from the bugTitle field
   */
  _onChangeInput(event) {
    const el = event.target;

    const inputField = el.name.split('.')[1]; // super brittle

    this.formFields[inputField] = el.value;

    if (el.name === 'formFields.bugTitle') {
      this.search(event);
    }
  }

  /**
   * Assemble the request for the server, send it, and
   * recieve the response
   * @param  {[type]} ev       Provided by Foundry, not used
   * @param  {[type]} formData HTML formData (includes all input elements with their values)
   */
  async _updateObject(ev, formData) {
    // obtain original data
    const mod = this.module;
    const {formFields: { bugTitle, bugDescription, issuer, label, sendActiveModules, sendModSettings }} = expandObject(formData);

    // if any of our warnings are not checked, throw
    if (!bugTitle || !bugDescription) {
      const errorMessage = game.i18n.localize('BUG.form.errors.incomplete');
      ui.notifications.error(errorMessage);

      throw errorMessage;
    }

    // update default contactInfo if different from stored default
    if (issuer !== game.settings.get("bug-reporter", "contactInfo")) {
      await game.settings.set("bug-reporter", "contactInfo", issuer);
    }

    // assemble header strings
    const descriptionString = `**Description**:\n${bugDescription}`;
    const issuerString = issuer ? `**Submitted By**: ${issuer}` : '';
    const labelString = label ? `**Feedback Type**: ${label}` : '';

    // find and assemble version details
    const versions = [
      `**Core:** ${game.data.version}`,
      `**System:** ${game.system.id} v${game.system.data.version}`,
      `**Module Version:** ${mod.data.name} v${mod.data.version}`
    ];

    // If any dependencies are present, add their details
    if (this.dependencies) {
      this.dependencies.forEach((depend) => {
        if (depend.active) {
          versions.push(`**Dependency Version:** ${depend.name} v${depend.version}`);
        }
      });
    }

    // make user inputted data one string
    const fullDescription = [[issuerString, labelString].join('\n'), versions.join('\n'), descriptionString].join('\n \n');

    let bugsUrl = this.endpoints.bugs;

    // generating active module list from game.modules
    const moduleList = sendActiveModules ? generateActiveModuleList() : "";
    // generate module settings
    const moduleSettings = sendModSettings ? generateModuleSettings(mod) : "";

    // construct gitlab link (if applicable)
    if (this.gitlab) {
      bugsUrl = bugsUrl + `?title=${encodeURIComponent(bugTitle)}&description=${encodeURIComponent(fullDescription + "\n" + moduleList + moduleSettings)}`;
    }

    // let the app know we're ready to send stuff
    this.isSending = true;
    this.render();

    // forward request to server
    await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: bugTitle,
        body: fullDescription,
        repo: bugsUrl,
        moduleList,
        moduleSettings: moduleSettings
      }),
    })
    // wait for the response
      .then(async (res) => {
        // if successful
        if (res.status == 201) {
          await res.json().then((message) => {
            // map response to expected htmlUrl for web link
            if (this.gitlab) {
              message.htmlUrl = message.web_url;
            }
            // Completed!
            this.submittedIssue = message;
            console.log(
              "Thank you for your submission. If you wish to monitor or follow up with additional details like screenshots, you can find your issue here:",
              message.htmlUrl
            );
          });
        } else {
          ui.notifications.error(
            game.i18n.localize('BUG.error')
          );
          console.error('Bug Reporter encountered the following problem submitting your issue. Oh the irony...', res);
        }
      })
      .catch((err) => {
        ui.notifications.error("Something went wrong.");
        console.error(err);
      })
      // stop the spinner, show final product
      .finally(() => {
        this.isSending = false;
        this.render();
      });
  }

  /**
   * Get Issues from GH / GL and put into this.foundIssues, then this.render();
   */
  async search(event) {
    let query = $(event.currentTarget).val();

    let endpoint;
    // construct search endpoint with queries
    if (this.github) {
      endpoint = `${this.endpoints.search}+"${query}"`;
    } else if (this.gitlab) {
      endpoint = `${this.endpoints.search}?search=${encodeURIComponent(query)}&scope=all`;
    }
    // if no results, don't show anything
    if (query === '') {
      this.element.find("#bug-reporter-issues-found").empty();
      this.element.find('.found-issues').addClass('hidden');
      return;
    }
    // retrieve similar issues
    const fetchedIssues = await fetch(endpoint, {
      method: "GET",
    });
    const message = await fetchedIssues.json();

    // map our found issues into a similar format
    if (this.github) {
      this.foundIssues = message.items.map(
        ({html_url, state, created_at, title}) => ({
          html_url,
          state,
          openedLabel: new Date(created_at).toLocaleDateString(),
          title
        })
      );
    } else if (this.gitlab) {
      this.foundIssues = message.map(
        ({web_url, state, created_at, title}) => ({
          html_url: web_url,
          state,
          openedLabel: new Date(created_at).toLocaleDateString(),
          title
        })
      );
    }

    // show similar issues
    this.render();
  }

  activateListeners(html) {
    super.activateListeners(html);

    $(html).on('click', 'a', function() {
      this.close();
    }.bind(this));

    let message = this.checkVer(this.module);
    this.updateStatus(message);
  }

  /**
   * Utilizes the Forge's API to determine the remote version of a module.
   * @param  {object} mod Foundry Module object
   * @return {object}     Wrapper for the most current manifest for the module
   */
  async checkVer(mod) {
    fetch(
      "https://forge-vtt.com/api/bazaar/manifest/" +
      mod.data.name +
        "?coreVersion=" +
        game.data.version
    ).then((res) => {
      res.json().then((message) => {
        return message;
      });
    });
  }

  /**
   * Takes a response from checkVer() and updates the UI to reflect updated status
   * @param  {object} message result of checkVer(this.module)
   */
  updateStatus(message) {
    if (message.manifest === null) {
      return;
    }

    if (!isNewerVersion(message.manifest?.version, this.module.data.version)) {
      // we are up to date
      this.element.find(".versionCheck .tag.success").removeClass("hidden");
      this.element.find(".versionCheck .tag.warning").addClass("hidden");
    } else {
      // update required
      this.element.find(".versionCheck .tag.success").addClass("hidden");
      this.element.find(".versionCheck .tag.warning").removeClass("hidden");
    }
  }

}

/**
 * Dialog that presents the user a choice of which module they would like to 
 * report a bug, make a suggestion, etc. for. This list is filtered to only
 * modules that have explicitly allowed Bug Reporter to work with them.
 * @return {Promise} Chosen module's name
 */
function getModuleSelection() {
  return new Promise((resolve, reject) => {
    // filter modules to only modules & sytem that have a bugs field
    // and is active
    const moduleOptions = [...game.modules.values(), game.system]
      .filter(
        (mod) =>
          (mod.active || mod.template) && !!mod.data.bugs
      )
      // we don't need all of the info, just these bits
      .map((mod) => ({
        title: mod.data.title,
        name: mod.data.name,
      })
    );

    // spawn an interactive HTML form inside Foundry
    // with buttons and localization!
    new Dialog({
      title: game.i18n.localize('BUG.moduleSelect.title'),
      content: `
        <select class="domain" name="selectedModule">
          <option value=""></option>
          ${moduleOptions.map((module) => {
            return `<option value="${module.name}">${module.title}</option>`
          })}
        </select>
        <p>${game.i18n.localize('BUG.moduleSelect.helper')}</p>
      `,
      buttons: {
        no: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize('Cancel'),
        },
        yes: {
          icon: '<i class="fas fa-check"></i>',
          label: game.i18n.localize('BUG.proceed'),
          callback: (html) => {
            const formValues = {
              selectedModule: html.find('[name="selectedModule"]').val(),
            };

            resolve(formValues);
          },
        },
      },
      default: 'yes',
      close: () => {
        reject();
      },
    }).render(true);
  });
}

// Once Foundry has initialized, add our Hook to listen for sidebar render
Hooks.once("init", () => {
  Hooks.on("renderSidebarTab", async (app, html) => {
    // Add our special Post Bug label
    if (app.options.id == "settings") {
      let button = $(`<button class='bug-report'><i class="fas fa-bug"></i> ${game.i18n.localize('BUG.bugButton.label')}</button>`);
      // Attach a listener to spawn our Form
      button.click(async (ev) => {
        const { selectedModule } = await getModuleSelection();
        new BugReportForm(undefined, { selectedModule } ).render(true);
      });
      // Adds our button at the top of the sidebar, underneath
      // game version
      button.insertAfter(html.find("#game-details"));
    }
  });

  game.settings.register("bug-reporter", "contactInfo", {
    scope: "client",
    config: false,
    default: "abc",
    type: String,
  });
});
