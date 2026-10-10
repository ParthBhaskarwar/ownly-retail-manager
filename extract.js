const https = require('https');
const fs = require('fs');

const urls = {
  'Dashboard': 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ6Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpZCiVodG1sXzAwMDY1Y2VjNWI5MTgzNjYwNDMxMDNlMDkxMzQ5N2U1EgsSBxDE0pGC9AoYAZIBIgoKcHJvamVjdF9pZBIUQhI2MjU1NTE4MDE3Njc4ODI5NzM&filename=&opi=89354086',
  'POS-Billing': 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ6Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpZCiVodG1sXzAwMDY1Y2VjZGRhYWY0ZWIwNzNhZjFiYWY1MDU5Y2U2EgsSBxDE0pGC9AoYAZIBIgoKcHJvamVjdF9pZBIUQhI2MjU1NTE4MDE3Njc4ODI5NzM&filename=&opi=89354086',
  'Products': 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ6Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpZCiVodG1sXzAwMDY1Y2VkMGJiNmQ4ZTIwMzM4NWVlYmM4MzI4YzcwEgsSBxDE0pGC9AoYAZIBIgoKcHJvamVjdF9pZBIUQhI2MjU1NTE4MDE3Njc4ODI5NzM&filename=&opi=89354086',
  'Inventory-Ledger': 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ6Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpZCiVodG1sXzAwMDY1Y2VkMzBlNzViY2UwMmE5OWZlOWI4MWE2NWI0EgsSBxDE0pGC9AoYAZIBIgoKcHJvamVjdF9pZBIUQhI2MjU1NTE4MDE3Njc4ODI5NzM&filename=&opi=89354086',
  'Login': 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ6Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpZCiVodG1sXzAwMDY1Y2VkZGRhZTZjMzgwMmE5OWVjYTljMDE0ZmZhEgsSBxDE0pGC9AoYAZIBIgoKcHJvamVjdF9pZBIUQhI2MjU1NTE4MDE3Njc4ODI5NzM&filename=&opi=89354086'
};

async function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function run() {
  for (const [name, url] of Object.entries(urls)) {
    console.log(`\n\n--- ${name} ---`);
    const html = await download(url);
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
    if (styleMatch) {
      const styles = styleMatch[1];
      // Print first 100 lines of CSS variables
      const rootVars = styles.match(/:root\s*{([^}]*)}/i);
      if (rootVars) {
        console.log(rootVars[1].trim());
      } else {
        console.log("No :root found");
      }
    } else {
      console.log("No style block found");
    }
  }
}
run();
