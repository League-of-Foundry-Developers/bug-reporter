using Newtonsoft.Json;

namespace FoundryVttBugReporterApi
{
    public class VersionInformation
    {
        [JsonProperty("core")]
        public string Core { get; set; }

        [JsonProperty("system")]
        public string System { get; set; }

        [JsonProperty("module")]
        public string Module { get; set; }
    }
}
