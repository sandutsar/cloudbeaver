/*
 * CloudBeaver - Cloud Database Manager
 * Copyright (C) 2020-2024 DBeaver Corp and others
 *
 * Licensed under the Apache License, Version 2.0.
 * you may not use this file except in compliance with the License.
 */
import { computed, makeObservable, runInAction } from 'mobx';

import { injectable } from '@cloudbeaver/core-di';
import { AutoRunningTask, ISyncExecutor, ITask, SyncExecutor, whileTask } from '@cloudbeaver/core-executor';
import { CachedDataResource, type ResourceKeySimple, ResourceKeyUtils } from '@cloudbeaver/core-resource';
import { SessionDataResource, SessionResource } from '@cloudbeaver/core-root';
import { AuthInfo, AuthLogoutQuery, AuthStatus, GetActiveUserQueryVariables, GraphQLService, UserInfo } from '@cloudbeaver/core-sdk';

import { AUTH_PROVIDER_LOCAL_ID } from './AUTH_PROVIDER_LOCAL_ID';
import { AuthProviderService } from './AuthProviderService';
import type { ELMRole } from './ELMRole';
import type { IAuthCredentials } from './IAuthCredentials';

export type UserInfoIncludes = GetActiveUserQueryVariables;

export type UserLogoutInfo = AuthLogoutQuery['result'];

export interface ILoginOptions {
  credentials?: IAuthCredentials;
  configurationId?: string;
  linkUser?: boolean;
  forceSessionsLogout?: boolean;
}

export const ANONYMOUS_USER_ID = 'anonymous';

@injectable()
export class UserInfoResource extends CachedDataResource<UserInfo | null, void, UserInfoIncludes> {
  readonly onUserChange: ISyncExecutor<string>;
  readonly onException: ISyncExecutor<Error>;

  get authRole(): ELMRole | undefined {
    return this.data?.authRole as ELMRole | undefined;
  }

  get parametersAvailable() {
    return this.data !== null;
  }

  constructor(
    private readonly graphQLService: GraphQLService,
    private readonly authProviderService: AuthProviderService,
    sessionResource: SessionResource,
    private readonly sessionDataResource: SessionDataResource,
  ) {
    super(() => null, undefined, ['customIncludeOriginDetails', 'includeConfigurationParameters']);

    this.onUserChange = new SyncExecutor();
    this.onException = new SyncExecutor();

    this.sync(
      sessionResource,
      () => {},
      () => {},
    );

    makeObservable(this, {
      parametersAvailable: computed,
    });
  }

  isLinked(provideId: string): boolean {
    return this.data?.linkedAuthProviders.includes(provideId) || false;
  }

  getId(): string {
    return this.data?.userId || ANONYMOUS_USER_ID;
  }

  hasToken(providerId: string): boolean {
    if (providerId === AUTH_PROVIDER_LOCAL_ID) {
      return true;
    }

    if (!this.data) {
      return false;
    }

    // TODO: will be changed due wrong origin in authTokens
    return this.data.authTokens.some(token => token.authProvider === providerId);
  }

  async login(provider: string, { credentials, configurationId, linkUser, forceSessionsLogout }: ILoginOptions): Promise<AuthInfo> {
    let processedCredentials: Record<string, any> | undefined;

    if (credentials) {
      const processed = await this.authProviderService.processCredentials(provider, credentials);
      processedCredentials = processed.credentials;
    }

    const { authInfo } = await this.graphQLService.sdk.authLogin({
      provider,
      configuration: configurationId,
      credentials: processedCredentials,
      linkUser,
      customIncludeOriginDetails: true,
      forceSessionsLogout,
    });

    if (authInfo.userTokens && authInfo.authStatus === AuthStatus.Success) {
      this.resetIncludes();
      this.setData(await this.loader());
      this.sessionDataResource.markOutdated();
    }

    return authInfo as AuthInfo;
  }

  finishFederatedAuthentication(authId: string, linkUser?: boolean): ITask<UserInfo | null> {
    let activeTask: ITask<AuthInfo> | undefined;

    return new AutoRunningTask<UserInfo | null>(
      async () => {
        activeTask = whileTask<AuthInfo>(
          authInfo => {
            if (authInfo.authStatus === AuthStatus.Success) {
              return true;
            } else if (authInfo.authStatus === AuthStatus.Error) {
              throw new Error('Authentication error');
            }

            return false;
          },
          async () => {
            const { authInfo } = await this.graphQLService.sdk.getAuthStatus({
              authId,
              linkUser,
              customIncludeOriginDetails: true,
            });
            return authInfo as AuthInfo;
          },
          1000,
        );

        const authInfo = await activeTask;

        if (authInfo.userTokens && authInfo.authStatus === AuthStatus.Success) {
          this.resetIncludes();
          this.setData(await this.loader());
          this.sessionDataResource.markOutdated();
        }

        return this.data;
      },
      () => {
        activeTask?.cancel();
      },
    );
  }

  async logout(provider?: string, configuration?: string): Promise<AuthLogoutQuery> {
    const result = await this.graphQLService.sdk.authLogout({
      provider,
      configuration,
    });

    this.resetIncludes();
    this.setData(await this.loader());
    this.sessionDataResource.markOutdated();

    return result;
  }

  async updatePreferences(preferences: Record<string, any>): Promise<UserInfo | null> {
    await this.performUpdate(undefined, [], async () => {
      const { user } = await this.graphQLService.sdk.updateUserPreferences({
        preferences,
        ...this.getDefaultIncludes(),
        ...this.getIncludesMap(),
      });

      this.setData(user as UserInfo | null);
    });

    return this.data;
  }

  async setConfigurationParameter(key: string, value: any): Promise<UserInfo | null> {
    await this.load();

    if (!this.parametersAvailable) {
      return this.data;
    }

    await this.performUpdate(undefined, [], async () => {
      await this.graphQLService.sdk.setUserConfigurationParameter({
        name: key,
        value,
      });

      if (this.data) {
        this.data.configurationParameters[key] = value;
      }

      this.onDataOutdated.execute();
    });

    return this.data;
  }

  async updateLocalPassword(oldPassword: string, newPassword: string): Promise<void> {
    await this.performUpdate(undefined, [], async () => {
      await this.graphQLService.sdk.authChangeLocalPassword({
        oldPassword: this.authProviderService.hashValue(oldPassword),
        newPassword: this.authProviderService.hashValue(newPassword),
      });
    });
  }

  async deleteConfigurationParameter(key: ResourceKeySimple<string>): Promise<UserInfo | null> {
    await this.load();

    if (!this.parametersAvailable) {
      return this.data;
    }

    const keyList: string[] = [];
    await this.performUpdate(undefined, [], async () => {
      await ResourceKeyUtils.forEachAsync(key, async name => {
        await this.graphQLService.sdk.setUserConfigurationParameter({
          name,
          value: null,
        });

        keyList.push(name);
      });

      runInAction(() => {
        for (const item of keyList) {
          delete this.data?.configurationParameters[item];
        }
      });

      this.onDataOutdated.execute();
    });
    return this.data;
  }

  getConfigurationParameter(key: string): any {
    return this.data?.configurationParameters[key];
  }

  protected async loader(key: void, includes?: ReadonlyArray<string>): Promise<UserInfo | null> {
    try {
      const { user } = await this.graphQLService.sdk.getActiveUser({
        ...this.getDefaultIncludes(),
        ...this.getIncludesMap(key, includes),
      });

      return (user as UserInfo | null) || null;
    } catch (exception: any) {
      if (this.onException.isEmpty) {
        throw exception;
      }
      this.onException.execute(exception);
      return null;
    }
  }

  protected setData(data: UserInfo | null): void {
    const prevUserId = this.getId();
    super.setData(data);
    const currentUserId = this.getId();

    if (prevUserId !== currentUserId) {
      this.onUserChange.execute(currentUserId);
    }
  }

  private getDefaultIncludes(): UserInfoIncludes {
    return {
      customIncludeOriginDetails: true,
      includeConfigurationParameters: false,
      includeMetaParameters: false,
    };
  }
}
