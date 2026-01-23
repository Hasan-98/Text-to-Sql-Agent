import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TASKS_FILE = path.join(__dirname, '../tasks.json');

const cities = ["Istanbul", "Ankara", "Izmir", "Bursa", "Antalya"];
const districts = {
    "Istanbul": ["Kadikoy", "Besiktas", "Sisli", "Uskudar", "Bakirkoy"],
    "Ankara": ["Cankaya", "Yenimahalle", "Kecioren", "Etimesgut"],
    "Izmir": ["Karsiyaka", "Konak", "Bornova", "Buca"],
    "Bursa": ["Nilufer", "Osmangazi", "Yildirim"],
    "Antalya": ["Muratpasa", "Konyaalti", "Kepez"]
};

const actionThemes = [
    { theme: "Staffing Optimization", actions: ["Hire 2 additional staff members", "Implement shift rotation system", "Conduct staff training program"] },
    { theme: "Revenue Growth", actions: ["Launch promotional campaign", "Optimize product placement", "Introduce loyalty program"] },
    { theme: "Quality Improvement", actions: ["Conduct store audit", "Implement quality control checks", "Upgrade equipment"] },
    { theme: "Cost Efficiency", actions: ["Negotiate supplier contracts", "Reduce energy consumption", "Optimize inventory levels"] },
    { theme: "Customer Service", actions: ["Install feedback system", "Train customer service team", "Improve checkout process"] }
];

const responsibles = ["HR Manager", "Regional Manager", "Store Manager", "District Manager", "Operations Manager"];
const statuses = ["pending", "approved", "rejected"];

const tasks = [];
let taskId = 1;

// Generate 25 tasks
for (let i = 0; i < 25; i++) {
    const city = cities[Math.floor(Math.random() * cities.length)];
    const district = districts[city][Math.floor(Math.random() * districts[city].length)];
    const themeObj = actionThemes[Math.floor(Math.random() * actionThemes.length)];
    const action = themeObj.actions[Math.floor(Math.random() * themeObj.actions.length)];
    const responsible = responsibles[Math.floor(Math.random() * responsibles.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];

    // Generate date in March 2025
    const day = Math.floor(Math.random() * 28) + 1;
    const date = `2025-03-${String(day).padStart(2, '0')}`;

    tasks.push({
        id: taskId++,
        title: `${action} - ${city} ${district}`,
        description: `Strategic ${themeObj.theme.toLowerCase()} initiative for ${district} district in ${city}. This action aims to improve operational metrics and store performance.`,
        priority: i % 3 === 0 ? "high" : (i % 2 === 0 ? "medium" : "low"),
        assignedTo: responsible,
        deadline: "2025-04-30",
        expectedOutcome: `Improve ${themeObj.theme.toLowerCase()} metrics by 15-20% within Q2 2025`,
        storesAffected: Math.floor(Math.random() * 5) + 1,
        status: status,
        createdAt: new Date().toISOString(),
        sourceQuery: "System Generated",
        // Extended metadata for filtering
        city: city,
        district: district,
        storeName: `${city}-${district}-${Math.floor(Math.random() * 3) + 1}`,
        actionTheme: themeObj.theme,
        responsible: responsible,
        date: date
    });
}

fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
console.log(`✅ Generated ${tasks.length} sample tasks for Screen 2 Dashboard`);
