import { enterCollection } from './collection-session.js';

void enterCollection(async () => {
    const chart = document.createElement('script');
    chart.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';
    chart.integrity = 'sha384-vsrfeLOOY6KuIYKDlmVH5UiBmgIdB1oEf7p01YgWHuqmOHfZr374+odEv96n9tNC';
    chart.crossOrigin = 'anonymous';
    await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 1_500);
        const done = () => { clearTimeout(timeout); resolve(); };
        chart.addEventListener('load', done, { once: true });
        chart.addEventListener('error', done, { once: true });
        document.head.append(chart);
    });
    await import('./app.js');
});
