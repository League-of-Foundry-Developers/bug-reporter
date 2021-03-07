using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.CognitiveServices.ContentModerator;
using Octokit;
using Octokit.Internal;
using System.Text.RegularExpressions;
using System.Linq;
using System.Collections.Generic;
using System.Net.Http;

namespace FoundryVttBugReporterApi
{
    public static class ReportBugFunction
    {
        private static HttpClient _httpClient = null;

        [FunctionName("ReportBugFunction")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "post", Route = null)] HttpRequest req,
            ILogger log)
        {
            var contentModerator = CreateContentModeratorClient();

            var requestBody = await new StreamReader(req.Body).ReadToEndAsync();
            var report = JsonConvert.DeserializeObject<BugReport>(requestBody);

            var moderationResult = await contentModerator.TextModeration.ScreenTextAsync("text/plain", GenerateStreamFromString(GetContentToModerate(report)), "eng", true, false, null, true);

            if (moderationResult.Classification.ReviewRecommended.HasValue && moderationResult.Classification.ReviewRecommended.Value)
            {
                return new ObjectResult(moderationResult)
                {
                    StatusCode = StatusCodes.Status400BadRequest
                };
            }

            if (report.RepositoryUrl.Contains("gitlab.com"))
            {
                return await CreateGitlabBug(report);
            }

            var githubUrlRegex = new Regex(@"github\.com\/(repos\/)?([A-z|\-|1-9]*)\/([A-z|\-|1-9]*)");
            if (!githubUrlRegex.IsMatch(report.RepositoryUrl))
            {
                return new ObjectResult(report.RepositoryUrl + " does not seem to be a correct Github URL")
                {
                    StatusCode = StatusCodes.Status400BadRequest
                };
            }

            return await CreateGithubBug(report, githubUrlRegex);
        }

        private static async Task<IActionResult> CreateGithubBug(BugReport report, Regex githubUrlRegex)
        {
            var github = CreateGithubClient();
            var issue = new NewIssue(report.Title)
            {
                Body = ""
            };

            if (report.VersionInformation != null)
            {
                issue.Body += $"**Core:** {report.VersionInformation.Core}\n**System:** {report.VersionInformation.System}\n";
                if (!string.IsNullOrEmpty(report.VersionInformation.Module))
                {
                    issue.Body += $"**Module Version: ** ${report.VersionInformation.Module}\n";
                }
            }
            issue.Body += "\n" + report.Body;

            if (report.ModuleSettingsHtml != null && report.ModuleSettingsHtml.StartsWith("<details>") && report.ModuleSettingsHtml.EndsWith("</details>\n"))
            {
                issue.Body += report.ModuleSettingsHtml;
            }

            if (report.ModuleListHtml != null && report.ModuleListHtml.StartsWith("<details>") && report.ModuleListHtml.EndsWith("</details>"))
            {
                issue.Body += report.ModuleListHtml;
            }

            var match = githubUrlRegex.Match(report.RepositoryUrl);
            var owner = match.Groups.Values.ElementAt(2).Value;
            var repo = match.Groups.Values.ElementAt(3).Value;

            try
            {
                var createdIssue = await github.Issue.Create(owner, repo, issue);

                return new ObjectResult(createdIssue)
                {
                    StatusCode = StatusCodes.Status201Created
                };
            }
            catch (Exception e)
            {
                return new ObjectResult(e)
                {
                    StatusCode = StatusCodes.Status500InternalServerError
                };
            }
        }

        private static async Task<IActionResult> CreateGitlabBug(BugReport report)
        {
            try
            {
                if (_httpClient == null)
                {
                    _httpClient = new HttpClient();
                    _httpClient.DefaultRequestHeaders.Add("PRIVATE-TOKEN", Environment.GetEnvironmentVariable("GitlabPAT"));
                }
                
                var result = await _httpClient.PostAsync(report.RepositoryUrl, new StringContent(""));

                if (!result.IsSuccessStatusCode) throw new Exception(result.StatusCode + " " + result.ReasonPhrase);

                var response = await result.Content.ReadAsStringAsync();

                return new ObjectResult(response)
                {
                    StatusCode = StatusCodes.Status201Created
                };
            }
            catch (Exception e)
            {
                return new ObjectResult(e)
                {
                    StatusCode = StatusCodes.Status500InternalServerError
                };
            }
        }

        private static string GetContentToModerate(BugReport report)
        {
            var toModerate = new List<string>()
            {
                report.Title,
                report.Body
            };

            if (report.VersionInformation != null)
            {
                toModerate.Add(report.VersionInformation.Core);
                toModerate.Add(report.VersionInformation.System);
                if (!string.IsNullOrEmpty(report.VersionInformation.Module))
                {
                    toModerate.Add(report.VersionInformation.Module);
                }
            }

            return string.Join(" ", toModerate);
        }

        private static Stream GenerateStreamFromString(string s)
        {
            var stream = new MemoryStream();
            var writer = new StreamWriter(stream);
            writer.Write(s);
            writer.Flush();
            stream.Position = 0;
            return stream;
        }

        private static ContentModeratorClient CreateContentModeratorClient()
        {
            ContentModeratorClient client = new ContentModeratorClient(new ApiKeyServiceClientCredentials(Environment.GetEnvironmentVariable("ContentModerationApiKey")))
            {
                Endpoint = Environment.GetEnvironmentVariable("ContentModerationEndpoint")
            };

            return client;
        }

        private static GitHubClient CreateGithubClient()
        {
            var githubPat = Environment.GetEnvironmentVariable("GithubPAT");
            return new GitHubClient(new ProductHeaderValue("foundryvtt-bug-reporter"), new InMemoryCredentialStore(new Credentials(githubPat)));
        }
    }
}
