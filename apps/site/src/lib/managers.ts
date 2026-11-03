// The four ready-made Office Managers, as the cards show them. The words are
// the copy deck's, and the art comes from scripts/art.ts: a portrait and four
// frames of walk for each, in static/art/.
export type Manager = {
  id: string;
  name: string;
  trait: string;
  says: string;
};

export const MANAGERS: Manager[] = [
  {
    id: 'marshall',
    name: 'Marshall',
    trait: 'Savvy',
    says: 'Calm and organized. I keep the floor steady and tell you who to hire next.'
  },
  {
    id: 'ziva',
    name: 'Ziva',
    trait: 'Sharp',
    says: 'I read the room before you walk in. Short answers, nothing gets past me.'
  },
  {
    id: 'jamal',
    name: 'Jamal',
    trait: 'Executive presence',
    says: 'I run the floor like a boardroom. You set the course, and I make the calls.'
  },
  {
    id: 'cindy',
    name: 'Cindy',
    trait: 'Intense',
    says: "I don't do half done. I close every loose end and flag anything that's off."
  }
];
