import FlightDemo from './FlightDemo.tsx';
import HirdDemo from './HirdDemo.tsx';
import SetDemo from './SetDemo.tsx';

// The playable preview for each project that has one, by the name in its `demo` field. Each is a
// small, scripted model of what the product does, never the product itself.
export const DEMOS = { hird: HirdDemo, flight: FlightDemo, sets: SetDemo };
