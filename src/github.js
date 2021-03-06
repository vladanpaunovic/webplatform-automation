import { Octokit } from "octokit";
import CONFIG from "./config.js";

const octokit = new Octokit({ auth: CONFIG.GITHUB_TOKEN });

// Helper function, used to test auth flow
export const login = await octokit.rest.users.getAuthenticated();

/**
 * @param {string} searchQuery
 */
export const getIssuesFromQuery = async (searchQuery) => {
  console.info(`Querying Github for: ${searchQuery}`);
  const constructQuery = ({ searchQuery, after = null }) => `
      query {
          search(first: ${CONFIG.PAGE_LIMIT}, after: ${after}, type: ISSUE, query: "${searchQuery}") {
            issueCount
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                ... on Issue {
                  id
                  title
                }
              }
            }
          }
        }
      `;

  const firstPage = await octokit.graphql(constructQuery({ searchQuery }));
  let issues = [];
  issues.push(...firstPage.search.edges);

  let after = firstPage.search.pageInfo.hasNextPage
    ? `"${firstPage.search.pageInfo.endCursor}"`
    : null;

  while (after != null) {
    var page = await octokit.graphql(constructQuery({ searchQuery, after }));
    issues.push(...page.search.edges);
    after = page.search.pageInfo.hasNextPage
      ? `"${page.search.pageInfo.endCursor}"`
      : null;
  }

  return issues.map((issue) => issue.node);
};

/**
 * @param {Object} project
 * @param {string} project.githubUser
 * @param {number} project.projectNumber
 * @param {"user"|"organization"} project.type
 * @param {string|null} project.after
 * @param {number} project.limit
 */
export const getProject = async ({
  githubUser,
  projectNumber,
  type = "user",
  after = null,
  limit = CONFIG.PAGE_LIMIT,
}) => {
  const items = await octokit.graphql(`
  query{
    ${type}(login: "${githubUser}"){
      projectNext(number: ${projectNumber}) {
        id
        items(first: ${limit}, after: ${after}) {
          pageInfo {
            endCursor
            hasNextPage
          }
          
          nodes {
            id
            title
            content{
                ...on Issue {
                    id
                    title
                }
              }
          }
        }
      }
    }
  }`);

  return {
    items: items[type].projectNext.items,
    projectId: items[type].projectNext.id,
  };
};

/**
 * @param {Object} project
 * @param {string} project.githubUser
 * @param {number} project.projectNumber
 * @param {"user"|"organization"} project.type
 */
export const getAllProjectItems = async () => {
  const { githubUser, projectNumber, type } = CONFIG.githubProject;
  console.info(`Querying open issues in Github project: ${projectNumber}`);
  let items = [];

  // Read the first page.
  const firstBatchOfItems = await getProject({
    githubUser,
    projectNumber,
    type,
  });

  items.push(...firstBatchOfItems.items.nodes);

  let after = firstBatchOfItems.items.pageInfo.hasNextPage
    ? `"${firstBatchOfItems.items.pageInfo.endCursor}"`
    : null;

  while (after != null) {
    var page = await getProject({
      githubUser,
      projectNumber,
      type,
      after,
    });
    items.push(...page.items.nodes);
    after = page.items.pageInfo.hasNextPage
      ? `"${page.items.pageInfo.endCursor}"`
      : null;
  }

  return { projectItams: items, projectId: firstBatchOfItems?.projectId };
};

/**
 * @param {string} projectId
 * @param {string} issueId
 */
export const addItemToProject = async (projectId, issueId) => {
  return await octokit.graphql(`
    mutation {
        addProjectNextItem(input: {projectId: "${projectId}" contentId: "${issueId}"}) {
          projectNextItem {
            id
          }
        }
      }`);
};
