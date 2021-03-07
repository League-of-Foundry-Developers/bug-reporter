using Newtonsoft.Json;

namespace FoundryVttBugReporterApi
{
    public class BugReport
    {
        [JsonProperty("repo")]
        public string RepositoryUrl { get; set; }

        [JsonProperty("title")]
        public string Title { get; set; }

        [JsonProperty("body")]
        public string Body { get; set; }

        [JsonProperty("versionInformation")]
        public VersionInformation VersionInformation { get; set; }

        [JsonProperty("moduleList")]
        public string ModuleListHtml { get; set; }

        [JsonProperty("moduleSettings")]
        public string ModuleSettingsHtml { get; set; }
    }
}
