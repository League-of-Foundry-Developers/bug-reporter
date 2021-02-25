
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

	get isEditable() {
	  return this.options.editable && !this.isSending && !this.submittedIssue;
  }

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

  get endpoints() {
    let bugs, search;
    if (this.github) {
      const regex = /github.com\/(.+)\/issues/g;

      const match = regex.exec(this.module.data.bugs);

      const repo = match?.[1].toLowerCase();

      bugs = this.module.data.bugs;
      search = `https://api.github.com/search/issues?q=repo:${repo}`;
    } else if (this.gitlab) {
      const regex = /gitlab.com\/(.+)\/-\/issues/g;

      const match = regex.exec(this.module.data.bugs);

      const repo = match?.[1].toLowerCase();

      bugs = `https://gitlab.com/api/v4/projects/${encodeURIComponent(repo)}/issues`;
      search = bugs;
    }

    return { bugs: bugs, search: search };
  }

  get conflicts() {
    return this.module.data.conflicts?.map((conflict) => {
      const mod = game.modules.get(conflict.name);
      let conflictingVersion = false;
      let versionChecks = false;
      // Newer than min, older than max
      if ("versionMin" in conflict && "versionMax" in conflict) {
        versionChecks = true;
        if (isNewerVersion(mod.data.version, conflict.versionMin) && !isNewerVersion(mod.data.version, conflict.versionMax)) {
          conflictingVersion = true;
        }
      } else {
        versionChecks = false;
      }

      return {
        name: mod.data.title,
        active: mod.active,
        // TODO: Add conflicts min & max version checking
        version: mod.data.version,
        conflictingVersion,
        versionChecks,
      }
    })
  }

  get dependencies() {
    return this.module.data.dependencies?.map((dependency) => {
      const mod = game.modules.get(dependency.name);
      let upToDate;

      let remote = this.checkVer(mod);

      if (!isNewerVersion(remote.manifest?.version, mod.data.version)) {
        // we are up to date
        upToDate = true;
      } else {
        // update required
        upToDate = false;
      }

      return {
        name: mod.data.title,
        active: mod.active,
        version: mod.data.version,
        upToDate
      }
    })
  }

  getData() {
    let data = {
      ...super.getData(), 
      formFields: this.formFields,
      foundIssues: this.foundIssues,
      isSending: this.isSending,
      module: this.module,
      submittedIssue: this.submittedIssue,
      useBugReporter: this.useBugReporter,
      // if core version > 0.7.10 (like 0.8.X)
      unsupportedCore: isNewerVersion(game.data.version, "0.7.10"),
      conflicts: this.conflicts,
      dependencies: this.dependencies,
    };

    return data;
  }

  /**
   * override
   */
  _onChangeInput(event) {
    const el = event.target;

    const inputField = el.name.split('.')[1]; // super brittle

    this.formFields[inputField] = el.value;

    if (el.name === 'formFields.bugTitle') {
      this.search(event);
    }
  }

  async _updateObject(ev, formData) {
    const mod = this.module;
    const {formFields: { bugTitle, bugDescription, issuer, label }} = expandObject(formData);

    // if any of our warnings are not checked, throw
    if (!bugTitle || !bugDescription) {
      const errorMessage = game.i18n.localize('BUG.form.errors.incomplete');
      ui.notifications.error(errorMessage);

      throw errorMessage;
    }
    
    const descriptionString = `**Description**:\n${bugDescription}`;
    const issuerString = issuer ? `**Submitted By**: ${issuer}` : '';
    const labelString = label ? `**Feedback Type**: ${label}` : '';

    const versions = [
      `**Core:** ${game.data.version}`,
      `**System:** ${game.system.id} v${game.system.data.version}`,
      `**Module Version:** ${mod.data.name} v${mod.data.version}`
    ];

    let modSettings = [];
    game.settings.settings.forEach((setting) => {
      if (setting.module === mod.data.name) {
        if (setting.config && setting.type !== "object") {
          modSettings.push(setting.key);
        }
      }
    });

    modSettings = modSettings.map((key) => {
      let setting = game.settings.get(mod.data.name, key);
      return `${key}: ${setting}`;
    });

    const modSettingsMd = 
      "<details>\n" +
        "<summary>Module Settings</summary>\n\n" +
          "\`\`\`js\n" +  
          `${modSettings.join(",\n")}\n` +
          "\`\`\`\n" +
      "</details>\n";
      

    console.log(modSettingsMd);

    // If any dependencies are present
    this.dependencies.forEach((depend) => {
      if (depend.active) {
        versions.push(`**Dependency Version:** ${depend.name} v${depend.version}`);
      }
    });

    const fullDescription = [[issuerString, labelString].join('\n'), versions.join('\n'), descriptionString].join('\n \n');

    let bugsUrl = this.endpoints.bugs;
    // construct gitlab link (if applicable)
    if (this.gitlab) {
      bugsUrl = bugsUrl + `?title=${encodeURIComponent(bugTitle)}&description=${encodeURIComponent(fullDescription)}`;
    }

    const data = {
      bugs: bugsUrl,
      title: bugTitle,
      description: fullDescription,
      modSettings,
      modSettingsMd
    }

    console.log(data);
    return;
    this.isSending = true;
    this.render();

    await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: data.title,
        body: data.description,
        repo: data.bugs,
      }),
    })
      .then(async (res) => {
        if (res.status == 201) {
          await res.json().then((message) => {
            // map response to expected htmlUrl for web link
            if (this.gitlab) {
              message.htmlUrl = message.web_url;
            }
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
      .finally(() => {
        this.isSending = false;
        this.render();
      });
  }

  /**
   * Get Issues from GH and put into this.foundIssues, then this.render();
   */
  async search(event) {
    let query = $(event.currentTarget).val();

    let endpoint;
    if (this.github) {
      endpoint = `${this.endpoints.search}+"${query}"`;
    } else if (this.gitlab) {
      endpoint = `${this.endpoints.search}?search=${encodeURIComponent(query)}&scope=all`;
    }

    if (query === '') {
      this.element.find("#bug-reporter-issues-found").empty();
      this.element.find('.found-issues').addClass('hidden');
      return;
    }

    const fetchedIssues = await fetch(endpoint, {
      method: "GET",
    });
    const message = await fetchedIssues.json();

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


function getModuleSelection() {
  return new Promise((resolve, reject) => {
    
    const moduleOptions = [...game.modules.values(), game.system]
      .filter(
        (mod) =>
          (mod.active || mod.template) && !!mod.data.bugs
      )
      .map((mod) => ({
        title: mod.data.title,
        name: mod.data.name,
      })
    );

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

Hooks.once("init", () => {
  Hooks.on("renderSidebarTab", async (app, html) => {
    if (app.options.id == "settings") {
      let button = $(`<button class='bug-report'><i class="fas fa-bug"></i> ${game.i18n.localize('BUG.bugButton.label')}</button>`);

      button.click(async (ev) => {
        const { selectedModule } = await getModuleSelection();
        new BugReportForm(undefined, { selectedModule } ).render(true);
      });

      button.insertAfter(html.find("#game-details"));
    }
  });
});
