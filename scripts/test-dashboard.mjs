/**
 * Test the dashboard API endpoint.
 * Run: node scripts/test-dashboard.mjs
 */

const res = await fetch('http://localhost:3000/api/dashboard');
const data = await res.json();

console.log('Date:', data.date);
console.log('Countries with data:', data.countries?.length ?? 0);
console.log('');

for (const c of (data.countries ?? [])) {
  console.log(`${c.flag} ${c.name} (${c.code})`);
  for (const item of c.top5) {
    console.log(`  #${item.rank} ${item.name.slice(0, 40)}`);
  }
}
