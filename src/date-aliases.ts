// Copyright 2023 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

function dateToName(date: Date) {
  return `${date.getFullYear()}-${String(101 + date.getMonth()).substring(
    1,
  )}-${String(100 + date.getDate()).substring(1)}`;
}

// TODO: is this what people use?
/** ISO week date */
function dateToWeekName(date: Date) {
  const currentDate = new Date(date.getTime());
  currentDate.setDate(currentDate.getDate() + 4 - (currentDate.getDay() || 7));
  const yearStart = new Date(currentDate.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((+currentDate - +yearStart) / 86400000 + 1) / 7);
  return `${date.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function relativeDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

export function resolveDateAlias(alias: string) {
  switch (alias.toLowerCase()) {
    case 'today':
      return dateToName(new Date());
    case 'tomorrow':
      return dateToName(relativeDate(1));
    case 'yesterday':
      return dateToName(relativeDate(-1));
    case 'this week':
      return dateToWeekName(new Date());
    case 'next week':
      return dateToWeekName(relativeDate(+7));
    case 'last week':
      return dateToWeekName(relativeDate(-7));
    default:
      return;
  }
}
