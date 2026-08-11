export const DEMO_RACE_INFO = {
  race: 'Monaco Grand Prix',
  lap: '42 / 78',
  position: 'P7',
  driver: '#16 A. Leclerc',
  team: 'Team Scuderia'
};

export const DEMO_STATE = {
  stress: { value: 68, level: 'HIGH', trend: 'up' },
  frustration: { value: 45, level: 'MODERATE', trend: 'down' },
  fatigue: { value: 30, level: 'LOW', trend: 'up' },
  mentalLoad: { value: 75, level: 'HIGH', trend: 'up' }
};

export const DEMO_TIMELINE = Array.from({ length: 15 }, (_, i) => ({
  lap: 28 + i,
  stress: 40 + Math.random() * 30 + (i > 10 ? 15 : 0),
  frustration: 30 + Math.random() * 20,
  fatigue: 20 + i * 1.5,
  lapTime: 91 + Math.random() * 2 - (i > 5 && i < 10 ? 1 : 0) // Around 1:31 (91s)
}));

export const DEMO_RADIO_ENTRIES = [
  {
    id: 1,
    lap: 41,
    timestamp: '14:22:15',
    transcript: "The rear is stepping out on turn 7. I have no grip!",
    severity: 'HIGH',
    tags: ['Rear Grip', 'Turn 7', 'High Urgency'],
  },
  {
    id: 2,
    lap: 39,
    timestamp: '14:19:30',
    transcript: "Are we pitting this lap or next? Traffic is bad.",
    severity: 'ELEVATED',
    tags: ['Strategy', 'Traffic'],
  },
  {
    id: 3,
    lap: 35,
    timestamp: '14:14:05',
    transcript: "Pace is good. Tyres feel okay for now.",
    severity: 'CALM',
    tags: ['Tyres', 'Pace'],
  },
  {
    id: 4,
    lap: 30,
    timestamp: '14:06:50',
    transcript: "Brakes getting a bit soft into turn 1.",
    severity: 'MODERATE',
    tags: ['Brakes', 'Turn 1'],
  }
];

export const DEMO_ALERTS = [
  {
    id: 1,
    type: 'warning',
    title: 'Rear grip issue mentioned',
    subtitle: 'Impacting performance in Sector 2'
  },
  {
    id: 2,
    type: 'info',
    title: 'Traffic impeding pace',
    subtitle: 'Costing ~0.4s per lap'
  }
];
