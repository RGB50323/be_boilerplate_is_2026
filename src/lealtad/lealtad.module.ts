import { Module } from '@nestjs/common';
import { LealtadController } from './controllers/index.js';
import { LealtadService } from './services/index.js';

@Module({ controllers: [LealtadController], providers: [LealtadService] })
export class LealtadModule {}
