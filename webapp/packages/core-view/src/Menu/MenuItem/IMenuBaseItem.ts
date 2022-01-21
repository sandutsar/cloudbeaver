/*
 * CloudBeaver - Cloud Database Manager
 * Copyright (C) 2020-2022 DBeaver Corp and others
 *
 * Licensed under the Apache License, Version 2.0.
 * you may not use this file except in compliance with the License.
 */

import type { IMenuItem } from './IMenuItem';

interface IMenuBaseItemCommonProperties {
  label?: string;
  icon?: string;
  tooltip?: string;
  hidden?: boolean;
  disabled?: boolean;
}

export interface IMenuBaseItemOptions extends IMenuBaseItemCommonProperties {
  id: string;
  label: string;
}

export interface IMenuBaseItem extends IMenuItem, IMenuBaseItemCommonProperties {
  label: string;
}
