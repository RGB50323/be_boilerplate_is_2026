export const OcupacionEvento = {
  RESERVACION_CAMBIADA: 'ocupacion.reservacion.cambiada',
} as const;

export interface ReservacionCambiadaEvento {
  sucursalId: number;
  fecha: string;
}

export interface OcupacionServerToClientEvents {
  'ocupacion:actualizada': (payload: ReservacionCambiadaEvento) => void;
}
