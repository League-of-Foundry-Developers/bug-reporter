/**
 * Based off of Moo Man's Excellent WFRP4e Bug Reporter
 * https://github.com/moo-man/WFRP4e-FoundryVTT/blob/master/modules/apps/bug-report.js
 */
class BugReportForm extends Application {
  constructor(app, { selectedModule }) {
    super(app);
    this.endpoint = "https://foundryvttbugreporter.azurewebsites.net/api/ReportBugFunction?code=VCvrWib1lha2nf9Pza7fOaThNTksbmHdEjVhIudCHwXg3zyg4vPprg==";
    this.module = game.modules.get(selectedModule);
    this.useBugReporter = this.module.data.allowBugReporter && this.module.data.bugs.includes("github");
  }

  static get defaultOptions() {
    const options = super.defaultOptions;
    options.id = "bug-report";
    options.template = "modules/bug-reporter/templates/bug-report.html";
    options.resizable = true;
    options.width = 600;
    options.minimizable = true;
    options.title = "Post Your Bugs";
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
    let data = super.getData();
    data.module = this.module;
    data.useBugReporter = this.useBugReporter;
    return data;
  }

  submit(data) {
    fetch(this.endpoint, {
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
      .then((res) => {
        if (res.status == 201) {
          ui.notifications.notify(
            "The Imperial Post Has Received Your Grievance! See the console for a link."
          );
          res.json().then((message) => {
            console.log(message);
            console.log(
              "%c%s%c%s",
              "color: gold",
              `IMPERIAL POST:`,
              "color: unset",
              ` Thank you for your grievance submission. If you wish to monitor or follow up with additional details like screenshots, you can find your issue here: ${message.json.html_url}`
            );
          });
        } else {
          ui.notifications.error(
            "The Imperial Post cannot receive your missive. Please see console for details."
          );
          console.error(res);
        }
      })
      .catch((err) => {
        ui.notifications.error("Something went wrong.");
        console.error(err);
      });
  }

  search(event) {
    let query = $(event.currentTarget).val();

    let endpoint = `${this.endpoints.search}+"${query}"`;

    if (query === '') {
      this.element.find("#bug-reporter-issues-found").empty();
      this.element.find('.found-issues').addClass('hidden');
      return;
    }

    fetch(endpoint, {
      method: "GET",
    }).then((res) => {
      res.json().then((message) => {
        this.element.find("#bug-reporter-issues-found").empty();

        if (message.items.length > 0) {
          this.element.find('.found-issues').removeClass('hidden');

          message.items.forEach((issue) => {
            this.element.find("#bug-reporter-issues-found").append(`
                            <div class="issue-card">
                              <h4 class="flexrow">
                                <a href=${issue.html_url} tabindex="-1">${issue.title}</a>
                                <div class="tag ${issue.state === 'open' ? 'success' : 'error'}">${issue.state}</div>
                              </h4>
                              <p>Opened ${new Date(issue.created_at).toLocaleDateString()}</p>
                            </div>`);
          });
        } else {
          this.element.find('.found-issues').addClass('hidden');
        }
      });
    });
  }

  activateListeners(html) {
    html.find(".bug-submit").click((ev) => {
      ev.preventDefault();

      const mod = this.module;
      let form = $(ev.currentTarget).parents("form")[0];

      const title = $(form).find(".bug-title")[0].value;
      
      const description = $(form).find(".bug-description")[0].value;

      const issuer = $(form).find(".issuer")[0].value;
      
      const label = $(form).find(".issue-label")[0].value;
      
      const descriptionString = `**Description**:\n${description}`;
      const issuerString = issuer ? `**Submitted By**: ${issuer}` : '';
      const labelString = label ? `**Feedback Type**: ${label}` : '';

      const versions = [
        `**Core:** ${game.data.version}`,
        `**System:** ${game.system.id} v${game.system.data.version}`,
        `**Module Version:** ${mod.data.name} v${mod.data.version}`
      ];

      if (!title || !description) {
        ui.notifications.notify("Please fill out the form")
        return;
      }

      const fullDescription = [[issuerString, labelString].join('\n'), versions.join('\n'), descriptionString].join('\n \n');

      const data = {
        bugs: this.module.data.bugs,
        title,
        description: fullDescription
      }

      this.submit(data);
      this.close();
    });

    html.find(".bug-title").change((event) => this.search(event));
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
    
    const moduleOptions = [...game.modules.values()]
      .filter(
        (mod) =>
          mod.active && !!mod.data.bugs
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
