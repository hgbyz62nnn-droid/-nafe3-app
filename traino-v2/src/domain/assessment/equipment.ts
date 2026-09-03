import type { IconName } from '../../components/ui/Icon';

export interface EquipmentOption {
  id: string;
  name: string;
  icon: IconName;
}

export const EQUIPMENT_OPTIONS: EquipmentOption[] = [
  { id: 'dumbbells', name: 'Dumbbells', icon: 'dumbbell' },
  { id: 'barbell', name: 'Barbell', icon: 'barbell' },
  { id: 'bench', name: 'Bench', icon: 'bench' },
  { id: 'squat_rack', name: 'Squat Rack', icon: 'squatRack' },
  { id: 'pull_up_bar', name: 'Pull-up Bar', icon: 'pullUpBar' },
  { id: 'cable_machine', name: 'Cable Machine', icon: 'cableMachine' },
  { id: 'kettlebell', name: 'Kettlebell', icon: 'kettlebell' },
  { id: 'resistance_bands', name: 'Resistance Bands', icon: 'resistanceBand' },
  { id: 'trx', name: 'TRX', icon: 'trx' },
  { id: 'treadmill', name: 'Treadmill', icon: 'treadmill' },
  { id: 'bike', name: 'Bike', icon: 'bike' },
  { id: 'rowing_machine', name: 'Rowing Machine', icon: 'rowingMachine' },
  { id: 'medicine_ball', name: 'Medicine Ball', icon: 'medicineBall' },
  { id: 'plyo_box', name: 'Plyo Box', icon: 'plyoBox' },
  { id: 'kickboard', name: 'Kickboard', icon: 'kickboard' },
  { id: 'pull_buoy', name: 'Pull Buoy', icon: 'pullBuoy' },
  { id: 'fins', name: 'Swim Fins', icon: 'fins' },
  { id: 'paddles', name: 'Swim Paddles', icon: 'paddles' },
  { id: 'other', name: 'Other', icon: 'otherEquipment' },
];
