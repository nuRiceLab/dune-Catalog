import React, { useState, useEffect } from 'react';
import { getDatasetAccessStats } from '@/lib/api';

export function DatasetAccessStats() {
    const [stats, setStats] = useState<{ [key: string]: { timesAccessed: number; lastAccessed: string } }>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchDatasetStats() {
            try {
                setIsLoading(true);
                const datasetStats = await getDatasetAccessStats();
                setStats(datasetStats);
                setError(null);
            } catch (err) {
                setError('Failed to load dataset statistics');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }

        fetchDatasetStats();
    }, []);

    // Sort datasets by times accessed in descending order
    const sortedDatasets = Object.entries(stats)
        .sort(([, a], [, b]) => b.timesAccessed - a.timesAccessed);

    if (isLoading) {
        return <p>Loading dataset access statistics...</p>;
    }

    if (error) {
        return <p className="text-red-500">{error}</p>;
    }

    return (
        <div className="dataset-access-stats">
            <h2 className="text-xl font-bold mb-4">Dataset Access Statistics</h2>
            {sortedDatasets.length === 0 ? (
                <p>No dataset access statistics available yet.</p>
            ) : (
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="border p-2 text-left">Dataset</th>
                            <th className="border p-2 text-right">Times Accessed</th>
                            <th className="border p-2 text-left">Last Accessed</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedDatasets.map(([key, value]) => (
                            <tr key={key} className="hover:bg-gray-50">
                                <td className="border p-2">{key}</td>
                                <td className="border p-2 text-right">{value.timesAccessed}</td>
                                <td className="border p-2">{new Date(value.lastAccessed).toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
