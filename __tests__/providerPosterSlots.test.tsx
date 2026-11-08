import React from 'react';
import renderer, {act} from 'react-test-renderer';
import Slider from '../src/components/Slider';

const mockNavigate = jest.fn();
const mockScroll = jest.fn();
let mockListMounts = 0;
let mockCardMounts = 0;
jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: mockNavigate})}));
jest.mock('../src/lib/tv/constants', () => ({isTV: false}));
jest.mock('../src/lib/zustand/contentStore', () => ({__esModule: true, default: (select: any) => select({provider: {value: 'fallback'}})}));
jest.mock('../src/theme/M3PaletteContext', () => ({useM3Colors: () => ({})}));
jest.mock('../src/lib/tv/useTVFocusBorderColor', () => ({useTVFocusBorderColor: () => ''}));
jest.mock('../src/components/tv', () => ({TVFocusGuide: require('react-native').View, TVFocusable: require('react-native').View}));
jest.mock('../src/components/ui/Text', () => require('react-native').Text);
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('../src/components/Skeleton', () => 'Skeleton');
jest.mock('../src/components/MediaPosterCard', () => {
  const ReactRuntime = require('react');
  return {
    __esModule: true, parseAspectRatio: () => 2 / 3,
    default: (props: any) => {
      ReactRuntime.useEffect(() => {mockCardMounts++;}, []);
      return ReactRuntime.createElement('PosterCard', props);
    },
  };
});
jest.mock('react-native-gesture-handler', () => {
  const ReactRuntime = require('react');
  return {FlatList: ReactRuntime.forwardRef((props: any, ref: any) => {
    ReactRuntime.useImperativeHandle(ref, () => ({scrollToOffset: mockScroll}));
    ReactRuntime.useEffect(() => {mockListMounts++;}, []);
    return ReactRuntime.createElement('PosterList', props,
      props.data.map((item: any, index: number) => ReactRuntime.createElement(ReactRuntime.Fragment,
        {key: props.keyExtractor(item, index)}, props.renderItem({item, index}))),
    );
  })};
});

const row = (provider: string) => <Slider isLoading={false} title="Movies" filter="movies" providerValue={provider} scrollKey={provider + ':movies'} posts={[0, 1].map(index => ({title: provider + index, image: provider + index + '.jpg', link: provider + index, provider}))} />;
beforeEach(() => {mockListMounts = mockCardMounts = 0; mockNavigate.mockClear(); mockScroll.mockClear();});

it('bounds the phone poster window and routes presses to the newly bound provider/item', () => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {tree = renderer.create(row('provider-A'));});
  act(() => tree.update(row('provider-B')));
  expect(mockListMounts).toBe(2);
  expect(mockCardMounts).toBe(4);
  const list = tree.root.findByType('PosterList');
  expect(list.props.windowSize).toBe(3);
  expect(list.props.maxToRenderPerBatch).toBe(4);
  const cards = tree.root.findAllByType('PosterCard');
  expect(cards[0].props.title).toBe('provider-B0');
  expect(cards[0].props.poster).toBe('provider-B0.jpg');
  act(() => cards[0].props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith('Info', {link: 'provider-B0', provider: 'provider-B', poster: 'provider-B0.jpg'});
  act(() => tree.unmount());
});

it('restores each provider row offset after changing its list identity', () => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {tree = renderer.create(row('offset-A'));});
  const save = (x: number) => {
    const list = tree.root.findByType('PosterList');
    act(() => list.props.onScrollBeginDrag());
    act(() => list.props.onScroll({nativeEvent: {contentOffset: {x}}}));
  };
  save(350);
  act(() => tree.update(row('offset-B')));
  expect(mockScroll).toHaveBeenLastCalledWith({offset: 0, animated: false});
  save(120);
  act(() => tree.update(row('offset-A')));
  expect(mockScroll).toHaveBeenLastCalledWith({offset: 350, animated: false});
  expect(mockListMounts).toBe(3);
  act(() => tree.unmount());
});
