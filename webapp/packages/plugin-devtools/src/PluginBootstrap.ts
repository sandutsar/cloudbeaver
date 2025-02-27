/*
 * CloudBeaver - Cloud Database Manager
 * Copyright (C) 2020-2024 DBeaver Corp and others
 *
 * Licensed under the Apache License, Version 2.0.
 * you may not use this file except in compliance with the License.
 */
import { App, Bootstrap, DIService, injectable, IServiceConstructor } from '@cloudbeaver/core-di';
import { CachedResource } from '@cloudbeaver/core-resource';
import { EAdminPermission, PermissionsService } from '@cloudbeaver/core-root';
import { ActionService, DATA_CONTEXT_SUBMENU_ITEM, MenuBaseItem, MenuService } from '@cloudbeaver/core-view';
import { TOP_NAV_BAR_SETTINGS_MENU } from '@cloudbeaver/plugin-settings-menu';
import { MENU_USER_PROFILE } from '@cloudbeaver/plugin-user-profile';

import { ACTION_DEVTOOLS } from './actions/ACTION_DEVTOOLS';
import { ACTION_DEVTOOLS_MODE_CONFIGURATION } from './actions/ACTION_DEVTOOLS_MODE_CONFIGURATION';
import { ACTION_DEVTOOLS_MODE_DISTRIBUTED } from './actions/ACTION_DEVTOOLS_MODE_DISTRIBUTED';
import { DATA_CONTEXT_MENU_SEARCH } from './ContextMenu/DATA_CONTEXT_MENU_SEARCH';
import { SearchResourceMenuItem } from './ContextMenu/SearchResourceMenuItem';
import { DevToolsService } from './DevToolsService';
import { MENU_DEVTOOLS } from './menu/MENU_DEVTOOLS';
import { MENU_PLUGIN } from './menu/MENU_PLUGIN';
import { MENU_PLUGINS } from './menu/MENU_PLUGINS';
import { MENU_RESOURCE } from './menu/MENU_RESOURCE';
import { MENU_RESOURCES } from './menu/MENU_RESOURCES';
import { PluginSubMenuItem } from './menu/PluginSubMenuItem';
import { ResourceSubMenuItem } from './menu/ResourceSubMenuItem';

@injectable()
export class PluginBootstrap extends Bootstrap {
  constructor(
    private readonly app: App,
    private readonly diService: DIService,
    private readonly menuService: MenuService,
    private readonly actionService: ActionService,
    private readonly devToolsService: DevToolsService,
    private readonly permissionsService: PermissionsService,
  ) {
    super();
  }

  register(): void {
    this.menuService.addCreator({
      menus: [TOP_NAV_BAR_SETTINGS_MENU],
      isApplicable: () => this.permissionsService.has(EAdminPermission.admin),
      getItems: (context, items) => [ACTION_DEVTOOLS, ...items],
    });

    // this.actionService.addHandler({
    //   id: 'devtools',
    //   isActionApplicable: (context, action) => [
    //     ACTION_DEVTOOLS,
    //   ].includes(action),
    //   isChecked: (context, action) => {

    //     switch (action) {
    //       case ACTION_DEVTOOLS: {
    //         return this.devToolsService.isEnabled;
    //       }
    //     }

    //     return false;
    //   },
    //   handler: (context, action) => {
    //     switch (action) {
    //       case ACTION_DEVTOOLS: {
    //         this.devToolsService.switch();
    //         break;
    //       }
    //     }
    //   },
    // });

    this.menuService.addCreator({
      menus: [MENU_USER_PROFILE],
      isApplicable: () => this.devToolsService.isEnabled,
      getItems: (context, items) => [MENU_DEVTOOLS, ...items],
    });

    this.menuService.addCreator({
      menus: [MENU_DEVTOOLS],
      getItems: (context, items) => {
        const search = context.tryGet(DATA_CONTEXT_MENU_SEARCH);

        if (search) {
          return [
            new SearchResourceMenuItem(),
            ...this.getResources(this.app.getServices().filter(service => service.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))),
          ];
        }

        return [new SearchResourceMenuItem(), ACTION_DEVTOOLS_MODE_DISTRIBUTED, ACTION_DEVTOOLS_MODE_CONFIGURATION, MENU_PLUGINS, ...items];
      },
    });

    this.actionService.addHandler({
      id: 'devtools-mode-configuration',
      actions: [ACTION_DEVTOOLS_MODE_CONFIGURATION],
      isChecked: () => this.devToolsService.isConfiguration,
      handler: () => {
        this.devToolsService.setConfigurationMode(!this.devToolsService.isConfiguration);
      },
    });

    this.actionService.addHandler({
      id: 'devtools-mode-distributed',
      actions: [ACTION_DEVTOOLS_MODE_DISTRIBUTED],
      isChecked: () => this.devToolsService.isDistributed,
      handler: () => {
        this.devToolsService.setDistributedMode(!this.devToolsService.isDistributed);
      },
    });

    this.menuService.addCreator({
      menus: [MENU_PLUGINS],
      getItems: (context, items) => [
        ...this.app
          .getPlugins()
          .sort((a, b) => a.info.name.localeCompare(b.info.name))
          .map(plugin => new PluginSubMenuItem(plugin)),
        ...items,
      ],
    });

    this.menuService.addCreator({
      menus: [MENU_PLUGIN],
      isApplicable: context => {
        const item = context.tryGet(DATA_CONTEXT_SUBMENU_ITEM);

        if (item instanceof PluginSubMenuItem) {
          return item.plugin.providers.some(provider => provider.prototype instanceof CachedResource);
        }

        return false;
      },
      getItems: (_, items) => [MENU_RESOURCES, ...items],
    });

    this.menuService.addCreator({
      menus: [MENU_RESOURCES],
      contexts: [DATA_CONTEXT_SUBMENU_ITEM],
      getItems: (context, items) => {
        const item = context.find(DATA_CONTEXT_SUBMENU_ITEM, item => item instanceof PluginSubMenuItem);

        if (!item) {
          return items;
        }

        const plugin = this.app.getPlugins().find(plugin => plugin.info.name === item.id);

        if (!plugin) {
          return items;
        }

        return [...this.getResources(plugin.providers), ...items];
      },
    });

    this.menuService.addCreator({
      menus: [MENU_RESOURCE],
      isApplicable: context => context.get(DATA_CONTEXT_SUBMENU_ITEM) instanceof ResourceSubMenuItem,
      getItems: (context, items) => {
        const item = context.get(DATA_CONTEXT_SUBMENU_ITEM) as ResourceSubMenuItem;

        return [
          new MenuBaseItem(
            {
              id: 'markOutdated',
              label: 'Mark outdated',
              tooltip: 'Outdate resource',
            },
            {
              onSelect: () => {
                const instance = this.diService.serviceInjector.getServiceByClass<CachedResource<any, any, any, any, any>>(item.resource);
                instance.markOutdated(undefined);
              },
            },
          ),
          ...items,
        ];
      },
    });
  }

  private getResources(providers: IServiceConstructor<any>[]): ResourceSubMenuItem[] {
    return providers
      .filter(service => service.prototype instanceof CachedResource)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(resource => new ResourceSubMenuItem(resource));
  }
}
