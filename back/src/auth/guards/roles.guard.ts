import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

export function Roles(...roles: Role[]): MethodDecorator & ClassDecorator {
  return (target: any, key?: any, descriptor?: any) => {
    const roles_value = roles;
    if (descriptor) {
      Reflect.defineMetadata(ROLES_KEY, roles_value, descriptor.value);
      return descriptor;
    }
    Reflect.defineMetadata(ROLES_KEY, roles_value, target);
    return target;
  };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const user = ctx.switchToHttp().getRequest().user;
    return required.includes(user?.role);
  }
}
