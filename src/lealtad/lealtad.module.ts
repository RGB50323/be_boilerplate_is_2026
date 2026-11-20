import { Module } from '@nestjs/common';
import { LealtadController } from './lealtad.controller.js';
import { LealtadService } from './lealtad.service.js';

@Module({ controllers: [LealtadController], providers: [LealtadService] })
export class LealtadModule {}
