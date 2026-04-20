import { createStore } from 'solid-js/store';
import type { SidebarState } from '../../core/types.js';

export interface NavigationState {
  sidebar: SidebarState;
}

export interface NavigationActions {
  focusSidebar: (sessionCount: number, activeIndex: number) => void;
  defocusSidebar: () => void;
  navigateUp: (maxIndex: number) => void;
  navigateDown: (maxIndex: number) => void;
  setSelectedIndex: (index: number) => void;
  resetSelection: (activeIndex: number) => void;
}

export function useNavigation(): { state: NavigationState; actions: NavigationActions } {
  const [state, setState] = createStore<SidebarState>({
    focused: false,
    selectedIndex: 0,
  });
  
  const actions: NavigationActions = {
    focusSidebar: (_sessionCount: number, activeIndex: number) => {
      setState({
        focused: true,
        selectedIndex: activeIndex >= 0 ? activeIndex : 0,
      });
    },
    
    defocusSidebar: () => {
      setState('focused', false);
    },
    
    navigateUp: (maxIndex: number) => {
      setState('selectedIndex', (prev) => {
        const next = prev - 1;
        return next < 0 ? maxIndex : next;
      });
    },
    
    navigateDown: (maxIndex: number) => {
      setState('selectedIndex', (prev) => {
        const next = prev + 1;
        return next > maxIndex ? 0 : next;
      });
    },
    
    setSelectedIndex: (index: number) => {
      setState('selectedIndex', index);
    },
    
    resetSelection: (activeIndex: number) => {
      setState('selectedIndex', activeIndex >= 0 ? activeIndex : 0);
    },
  };
  
  return {
    state: { sidebar: state },
    actions,
  };
}
