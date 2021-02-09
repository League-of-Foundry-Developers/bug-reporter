/**
 * Based off of Moo Man's Excellent WFRP4e Bug Reporter
 * https://github.com/moo-man/WFRP4e-FoundryVTT/blob/master/modules/apps/bug-report.js
 */
class BugReportForm extends Application {

    constructor(app) {
        super(app)
        this.endpoint = "http://127.0.0.1:8000"
        this.modules = [...game.modules.values()]
          .filter((mod) => mod.active && !!mod.data.bugs && mod.data.bugs.includes("github"))
          .map((mod) => (mergeObject({name: mod.data.title, version: mod.data.version}, this.constructURLs(mod))));
    }

    static get defaultOptions() {
        const options = super.defaultOptions;
        options.id = "bug-report";
        options.template = "modules/bug-reporter/templates/bug-report.html"
        options.resizable = true;
        options.height = 650;
        options.width = 600;
        options.minimizable = true;
        options.title = "Post Your Bugs"
        return options;
    }


    getData() {
        let data = super.getData();
        data.modules = this.modules;
        return data;
    }

    submit(data) {
        fetch(this.endpoint, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: data.title,
                body: data.description,
                labels : data.labels,
                endpoint: data.bugs
            })
        })
        .then(res => {
            if (res.status == 201)
            {
                ui.notifications.notify("The Imperial Post Has Received Your Grievance! See the console for a link.")
                res.json().then(message => {
                    console.log(message);
                    console.log("%c%s%c%s", 'color: gold', `IMPERIAL POST:`, 'color: unset', ` Thank you for your grievance submission. If you wish to monitor or follow up with additional details like screenshots, you can find your issue here: ${message.json.html_url}`)
                })
            }
            else 
            {
               ui.notifications.error("The Imperial Post cannot receive your missive. Please see console for details.")
               console.error(res)
            }   

        })
        .catch(err => {
            ui.notifications.error("Something went wrong.")
            console.error(err)
        })
    }

    activateListeners(html) {
        html.find(".bug-submit").click(ev => {
            let data = {};
            let form = $(ev.currentTarget).parents(".bug-report")[0];
            data.domain = $(form).find(".domain")[0].value
            data.title = $(form).find(".bug-title")[0].value
            data.ogtitle = data.title;
            data.description = $(form).find(".bug-description")[0].value
            data.issuer = $(form).find(".issuer")[0].value
            let label = $(form).find(".issue-label")[0].value;
            data.description = data.description + `<br/>**From**: ${data.issuer}`

            if (!data.domain || !data.title || !data.description)
                return ui.notifications.notify("Please fill out the form")

            let mod = this.modules[data.domain];
            
            let versions = `<br/>${game.system.id}: ${game.system.data.version}`

            versions = versions.concat(`<br/>${mod.name}: ${mod.version}`);           

            data.description = data.description.concat(versions);
            data.bugs = mod.bugs;

            this.submit(data)
            this.close()
        })
    }

    constructURLs(module) {
        const regex = /github.com\/(.+)\/issues/g;

        const match = regex.exec(module.data.bugs);

        const repo = match?.[1].toLowerCase();

        const bugs = `https://api.github.com/repos/${repo}/issues`
        const search = `https://api.github.com/search/issues?q=repo:${repo}`;

        return {bugs: bugs, search: search};
    }
}

Hooks.once("init", () => {
  Hooks.on("renderSidebarTab", async (app, html) => {
    if (app.options.id == "settings")
    {
      let button = $(`<button class='bug-report'>Post Bug</button>`)
  
      button.click(ev => {
        new BugReportForm().render(true);
      })
  
      button.insertAfter(html.find("#game-details"))
      
    }
  });
});
