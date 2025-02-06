// import fs from 'fs';
// import path from 'path';
//
// interface DatasetUsage {
//     namespace: string;
//     name: string;
//     views: number;
//     lastAccessed: string;
// }
//
// interface UsageStats {
//     datasets: { [key: string]: DatasetUsage };
//     lastUpdated: string;
// }
//
// const STATS_FILE = path.join(process.cwd(), 'data', 'usage-stats.json');
//
// // Ensure the data directory exists
// if (!fs.existsSync(path.dirname(STATS_FILE))) {
//     fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true });
// }
//
// function loadStats(): UsageStats {
//     try {
//         if (fs.existsSync(STATS_FILE)) {
//             const data = fs.readFileSync(STATS_FILE, 'utf8');
//             return JSON.parse(data);
//         }
//     } catch (error) {
//         console.error('Error loading statistics:', error);
//     }
//     return { datasets: {}, lastUpdated: new Date().toISOString() };
// }
//
// function saveStats(stats: UsageStats): void {
//     try {
//         fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
//     } catch (error) {
//         console.error('Error saving statistics:', error);
//     }
// }
//
// export function recordDatasetAccess(namespace: string, name: string): void {
//     const stats = loadStats();
//     const key = `${namespace}/${name}`;
//
//     if (!stats.datasets[key]) {
//         stats.datasets[key] = {
//             namespace,
//             name,
//             views: 0,
//             lastAccessed: new Date().toISOString()
//         };
//     }
//
//     stats.datasets[key].views += 1;
//     stats.datasets[key].lastAccessed = new Date().toISOString();
//     stats.lastUpdated = new Date().toISOString();
//
//     saveStats(stats);
// }
//
// export function getDatasetStats(namespace: string, name: string): DatasetUsage | null {
//     const stats = loadStats();
//     const key = `${namespace}/${name}`;
//     return stats.datasets[key] || null;
// }
//
// export function getAllStats(): UsageStats {
//     return loadStats();
// }
