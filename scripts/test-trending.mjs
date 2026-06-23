const res = await fetch('http://localhost:3000/api/trending');
const data = await res.json();

console.log(`เปรียบเทียบ ${data.oldDate} → ${data.latestDate}\n`);
for (const c of (data.countries ?? [])) {
  console.log(`${c.flag} ${c.name}`);
  for (const item of c.trending) {
    console.log(`  ▲${item.improvement}  #${item.old_rank}→#${item.current_rank}  ${item.name.slice(0, 40)}`);
  }
}
