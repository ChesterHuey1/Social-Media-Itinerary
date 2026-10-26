import type { Objective } from '../domain/types';
import ui from './ui.module.css';

export const OBJECTIVES: { id: Objective; label: string }[] = [
  { id: 'eat', label: 'Eat' },
  { id: 'explore', label: 'Explore' },
  { id: 'pictures', label: 'Take pictures' },
  { id: 'experience', label: 'Experience' },
];

export const objectiveLabel = Object.fromEntries(OBJECTIVES.map((o) => [o.id, o.label])) as Record<Objective, string>;

export const objectiveClass: Record<Objective, string> = {
  eat: ui.eat,
  explore: ui.explore,
  pictures: ui.pictures,
  experience: ui.experience,
};
