export function resolveReleaseRevision(head, githubSha, cloudflareSha) {
  const claimed = [githubSha, cloudflareSha].filter(Boolean);
  if (claimed.length > 1 && claimed[0] !== claimed[1]) {
    throw new Error("Build environment reports conflicting commit revisions");
  }
  if (head && claimed.some(revision => revision !== head)) {
    throw new Error(`Build revision does not match checked-out commit ${head}`);
  }
  return claimed[0] ?? head;
}
