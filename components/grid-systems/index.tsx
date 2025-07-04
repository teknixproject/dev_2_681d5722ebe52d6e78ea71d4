'use client';
import _ from 'lodash';
import { usePathname, useSearchParams } from 'next/navigation';
import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

import { rebuilComponentMonaco } from '@/app/actions/use-constructor';
import { CONFIGS } from '@/configs';
import { useActions } from '@/hooks/useActions';
import { useHandleProps } from '@/hooks/useHandleProps';
import { componentRegistry } from '@/lib/slices';
import { cn, convertStyle, getDeviceSize, setActive } from '@/lib/utils';
import { useApiCallStore } from '@/providers';
import { apiResourceStore } from '@/stores';
import { GridItem } from '@/types/gridItem';
import { dynamicGenarateUtil } from '@/uitls/dynamicGenarate';

import NotFound from './404';
import { GapGrid, GridRow, mapAlineItem, mapJustifyContent, SpanCol, SpanRow } from './const';
import LoadingPage from './loadingPage';
import { CsContainerRenderSlice } from './styles';
import { GridSystemProps, RenderGripProps } from './types';

const componentHasAction = ['pagination', 'button', 'input_text'];
const componentHasMenu = ['dropdown'];
const allowUpdateTitle = ['content'];
type TRenderSlice = { slice: GridItem | null | undefined; idParent: string; isMenu?: boolean };
const { updateTitleInText } = dynamicGenarateUtil;
//#region Render Slice
export const RenderSlice: React.FC<TRenderSlice> = ({ slice, isMenu }) => {
  const pathname = usePathname();
  const { handleAction } = useActions(slice!);
  const apiData = useApiCallStore((state) => state.apiData);
  const [sliceRef, setSliceRef] = useState<GridItem | null | undefined>(slice);
  const { multiples } = useHandleProps({ actionsProp: slice?.props });
  const onPageLoad = useMemo(() => {
    return slice?.actions?.onPageLoad;
  }, [slice?.actions]);

  useEffect(() => {
    if (!_.isEmpty(onPageLoad)) {
      handleAction('onPageLoad');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPageLoad]);
  useEffect(() => {
    if (
      sliceRef &&
      sliceRef?.dynamicGenerate?.dataJsonPath &&
      allowUpdateTitle.includes(sliceRef.type)
    ) {
      const { apiCall } = sliceRef.dynamicGenerate || {};
      const valueJson = apiData.find((item) => item.id === apiCall?.id);
      const title = updateTitleInText(sliceRef, valueJson?.data);
      if (title !== sliceRef?.dataSlice?.title) {
        setSliceRef((prev) => ({
          ...prev,
          dataSlice: { title: _.isArray(title) ? title[0] : title },
          type: prev?.type || 'grid',
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiData, slice, updateTitleInText]);

  const key = _.upperFirst(sliceRef?.id?.split('$')[0]);

  const isButton = key === 'button';

  const data = useMemo(() => {
    return componentHasAction.includes(key!) ? sliceRef : _.get(sliceRef, 'dataSlice');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sliceRef]);

  const styleDevice: string = getDeviceSize() as string;

  const SliceComponent = useMemo(() => {
    return componentRegistry[key as keyof typeof componentRegistry];
  }, [key]);

  const styleSlice = (_.get(sliceRef, [styleDevice]) as React.CSSProperties) || sliceRef?.style;

  const sliceClasses = useMemo(() => {
    if (!sliceRef) return '';
    return [
      sliceRef.colspan ? SpanCol(Number(sliceRef.colspan)) : '',
      sliceRef.rowspan ? SpanRow(Number(sliceRef.rowspan)) : '',
      sliceRef.rows ? GridRow(Number(sliceRef.rows)) : '',
      sliceRef.gap ? GapGrid(Number(sliceRef.gap)) : '',
      sliceRef.type === 'grid' ? 'grid' : '',
      sliceRef.type === 'flex' && mapJustifyContent(sliceRef.justifyContent),
      sliceRef.type === 'flex' && mapAlineItem(sliceRef.alignItems),
      sliceRef.type === 'flex' && 'flex',
    ]
      .filter(Boolean)
      .join(' ');
  }, [sliceRef]);

  const inlineStyles = useMemo(() => {
    if (!sliceRef) return {};
    const styleSlice = (_.get(sliceRef, [styleDevice]) as React.CSSProperties) || sliceRef.style;
    return {
      gridTemplateColumns: sliceRef.type === 'grid' ? `repeat(${sliceRef.columns}, 1fr)` : '',
      ...styleSlice,
    };
  }, [sliceRef, styleDevice]);

  const content = SliceComponent ? (
    <>
      <SliceComponent
        id={_.get(sliceRef, 'id')}
        style={isButton ? styleSlice : convertStyle(styleSlice)}
        data={sliceRef}
        childs={sliceRef?.childs}
        styleDevice={styleDevice}
        pathname={pathname}
        {...multiples}
      />
    </>
  ) : (
    sliceRef?.childs && (
      <RenderGrid items={sliceRef.childs} idParent={sliceRef.id!} slice={sliceRef} />
    )
  );

  const isMemuConvert = isMenu || componentHasMenu.includes(key || '');
  const isActive = setActive({ isMenu: isMemuConvert, data, cleanedPath: pathname });

  return sliceClasses || Object.keys(inlineStyles).length ? (
    <CsContainerRenderSlice
      className={`${sliceClasses} ${_.get(styleSlice, 'className', '')} `}
      style={!isButton ? inlineStyles : {}}
      is-active={!!isActive == true ? 'true' : 'false'}
      styledComponentCss={!isButton ? sliceRef?.styledComponentCss : ''}
    >
      {content}
    </CsContainerRenderSlice>
  ) : null;
};

//#region Render Grid
export const RenderGrid: React.FC<RenderGripProps> = ({ idParent, slice }) => {
  const { apiData, addApiData } = useApiCallStore((state) => state);
  const [childs, setChilds] = useState<GridItem[]>(slice?.childs || []);
  const [isLoading, setIsLoading] = useState(false);

  const searchParams = useSearchParams();
  const uid = searchParams.get('uid');
  const { createCardsFromApi, getDataFromApi } = dynamicGenarateUtil;
  const { findApiResourceValue } = apiResourceStore();

  const apiCallId = slice?.dynamicGenerate?.apiCall?.id;

  useEffect(() => {
    if (!apiCallId) return;

    const fetchData = async () => {
      setIsLoading(true);

      try {
        const { apiCall, dataJsonPath } = slice.dynamicGenerate ?? {};
        const apiResource = findApiResourceValue(apiCall?.id || '');

        if (!apiResource) {
          setIsLoading(false);

          return;
        }

        const result = await getDataFromApi(apiData, idParent, apiResource);

        if (!_.isEmpty(result)) {
          addApiData({ id: apiCall?.id ?? '', data: result, idParent });
        }

        // Create new childs from API data
        const newCards = createCardsFromApi(slice, result, dataJsonPath ?? '');
        setChilds(newCards as GridItem[]);
      } catch (error) {
        console.error('Error fetching API data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiCallId, uid, idParent, slice]);

  // Memoize the rendered children to avoid unnecessary re-renders
  const renderedChildren = useMemo(() => {
    return _.map(childs, (child, index) => {
      return <RenderSlice slice={child} key={index} idParent={idParent} />;
    });
  }, [childs, idParent]);

  if (isLoading) {
    return <LoadingPage />;
  }

  return <>{renderedChildren}</>;
};

//#region Grid System
const GridSystemContainer: FC<GridSystemProps> = ({
  page,
  deviceType,
  isBody,
  isFooter,
  style,
}) => {
  const [layout, setLayout] = useState<GridItem | null>(null);
  const styleDevice: string = getDeviceSize() as string;

  const config = layout || page;

  const previousComponentRef = useRef(null);

  const content = (
    <>
      {config?.childs ? (
        <CsContainerRenderSlice
          className="w-full flex flex-col justify-center flex-wrap"
          id={config.id}
          style={{ ...(_.get(config, [styleDevice]) as React.CSSProperties), ...style }}
          styledComponentCss={config?.styledComponentCss}
        >
          <RenderGrid items={config.childs} idParent={config.id!} slice={config} />
        </CsContainerRenderSlice>
      ) : (
        <NotFound />
      )}
    </>
  );

  useEffect(() => {
    const socket = io(CONFIGS.SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket'],
    });
    socket.on('connected', () => console.log('connected'));
    socket.on('return-json', async (data) => {
      if (data?.component && data.component !== previousComponentRef.current) {
        previousComponentRef.current = data.component;
        await rebuilComponentMonaco(data.component);
      }
      if (data?.layout) {
        setTimeout(() => setLayout(data.layout[deviceType]), 0);
      }
    });
    return () => {
      socket.disconnect();
    };
  }, [deviceType]);

  return (
    <div className={cn('', isBody ? 'z-1 min-h-screen' : '', isFooter ? 'z-3' : '')} style={style}>
      {content}
    </div>
  );
};

export default GridSystemContainer;
