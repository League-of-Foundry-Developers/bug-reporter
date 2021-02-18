
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
    this.useBugReporter = this.module.data.allowBugReporter && this.module.data.bugs.includes("github");

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
    const regex = /github.com\/(.+)\/issues/g;

    const match = regex.exec(this.module.data.bugs);

    const repo = match?.[1].toLowerCase();

    const bugs = `https://api.github.com/repos/${repo}/issues`;
    const search = `https://api.github.com/search/issues?q=repo:${repo}`;

    return { bugs: bugs, search: search };
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
      unsupportedCore: isNewerVersion("0.8.0", "0.7.10"),
      conflicts: this.module.data.conflicts,
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

    const fullDescription = [[issuerString, labelString].join('\n'), versions.join('\n'), descriptionString].join('\n \n');

    const data = {
      bugs: this.module.data.bugs,
      title: bugTitle,
      description: fullDescription
    }

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

    let endpoint = `${this.endpoints.search}+"${query}"`;

    if (query === '') {
      this.element.find("#bug-reporter-issues-found").empty();
      this.element.find('.found-issues').addClass('hidden');
      return;
    }

    const fetchedIssues = await fetch(endpoint, {
      method: "GET",
    });
    const message = await fetchedIssues.json();

    this.foundIssues = message.items.map(
      ({html_url, state, created_at, title}) => ({
        html_url,
        state,
        openedLabel: new Date(created_at).toLocaleDateString(),
        title
      })
    );

    this.render();
  }

  activateListeners(html) {
    super.activateListeners(html);

    $(html).on('click', 'a', function() {
      this.close();
    }.bind(this));

    this.checkVer();
  }

  async checkVer() {
    fetch(
      "https://forge-vtt.com/api/bazaar/manifest/" +
      this.module.data.name +
        "?coreVersion=" +
        game.data.version
    ).then((res) => {
      res.json().then((message) => {
        if (message.manifest === null) {
          return;
        }

        if (!isNewerVersion(message.manifest?.version, this.module.data.version)) {
          // we are up to date
          this.element.find(".tag.success").removeClass("hidden");
          this.element.find(".tag.warning").addClass("hidden");
        } else {
          // update required
          this.element.find(".tag.success").addClass("hidden");
          this.element.find(".tag.warning").removeClass("hidden");
        }
      });
    });
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
      let button = $(`<button class='bug-report'>Post Bug</button>`);

      button.click(async (ev) => {
        const { selectedModule } = await getModuleSelection();
        new BugReportForm(undefined, { selectedModule } ).render(true);
      });

      button.insertAfter(html.find("#game-details"));
    }
  });
});
