// Making room round a selection (clearRoom in atlas-settle.js), off the main thread: the map
// asks with a roomJob and eases into the answer, so selecting never waits on it.
import { runRoomJob } from './atlas-settle.js';

self.onmessage = (e) => {
    const { job, work } = e.data;
    const xy = runRoomJob(work);
    self.postMessage({ job, xy }, [xy.buffer]);
};
