import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TASKS_FILE = path.join(__dirname, "tasks.json");

async function fixIds() {
    try {
        const data = await fs.readFile(TASKS_FILE, 'utf-8');
        let tasks = JSON.parse(data);

        console.log(`Current tasks: ${tasks.length}`);

        // Strategy: Assign new sequential IDs
        tasks = tasks.map((t, index) => ({
            ...t,
            id: index + 1
        }));

        await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
        console.log('Successfully re-indexed all tasks with unique IDs.');
    } catch (err) {
        console.error('Error fixing IDs:', err);
    }
}

fixIds();
