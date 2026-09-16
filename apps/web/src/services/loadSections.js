// Independent read models must not discard successful sections when one fails.
export async function loadSections(requests) {
  const entries = Object.entries(requests);
  const results = await Promise.allSettled(entries.map(([, request]) => Promise.resolve().then(request)));
  const data = {};
  const failed = [];
  results.forEach((result, index) => {
    const key = entries[index][0];
    data[key] = result.status === "fulfilled" ? result.value : null;
    if (result.status === "rejected") failed.push(key);
  });
  return { data, failed };
}
