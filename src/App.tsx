import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import ModalService, { ModalServiceRequest } from "poppyio/modal-service";
import InfiniteScroll from "react-infinite-scroll-component";
import './App.css'
import useInfiniteScroll from 'react-infinite-scroll-hook';
import sanitizeHtml from 'sanitize-html';


function App() {
  let [request, setRequest] = useState<ModalServiceRequest>();
  let [requestStatus, setRequestStatus] = useState('(Assuming this page is open in a poppy... currently detecting if that is so)');
  let [search, setSearch] = useState('');

  let updateSearch = (ev: ChangeEvent<HTMLInputElement>) => {
    setSearch(ev.target.value);
  };

  let pickMe = (ev: React.MouseEvent<HTMLAnchorElement>) => {
    ev.preventDefault();
    setSearch(ev.currentTarget.textContent!);
  };

  useEffect(() => {
    ModalService.getRequest().then(req => {
      if (req) {
        let match = req.matching.find(i => i.side === 'accepting' && i.form === 'content-download' || i.form === 'content-blob');
        if (match) {
          setRequest(req);
          setRequestStatus('(A compatible request was detected, from ' + match.origin + ')');
        } else {
          setRequestStatus('(This page is open in a poppy, but the client request is not compatible - this page is offering a content-download or content-blob)');
        }
      } else {
        setRequestStatus('(It does not appear this page is open in a poppy - no request was detected)');
      }
    });
  }, []);

  return (
    <div className='App'>
      <div className='App-header'>
        <form className='App-headerItem' onSubmit={ev => { ev.preventDefault(); document.getElementById('searchInput')?.blur(); }} style={{float: 'left'}}>
          <label htmlFor="searchInput">Search <strong>Flickr Commons</strong>:</label><br />
          <input value={search} id="searchInput" autoFocus type="text" onChange={updateSearch} />
        </form>
        <div className='App-headerItem' style={{float:'right'}}>
          <button onClick={() => ModalService.close()}>Cancel</button>
        </div>
      </div>
      {!!search ? <SearchResults search={search}/> : <Welcome requestStatus={requestStatus} setSearch={setSearch}/>}
    </div>
  );
}
function Welcome(props: {requestStatus: string, setSearch: (search: string) => void}) {
  let pickMe = (ev: React.MouseEvent<HTMLAnchorElement>) => {
    ev.preventDefault();
    props.setSearch(ev.currentTarget.textContent!);
  }
  return <div className='App-body'>
    <div className='App-bodyInner'>
      <div style={{margin:'auto', padding: '1rem', maxWidth: '40rem'}}>
    <p>
      This page is a Poppy I/O Service that lets you
      pick an image from the Flickr Commons, a collection of free
      archival images with no known copyright restrictions, and then
      send it back to the client page that opened it. {props.requestStatus}
    </p>
    <p>
      Type in a search above to get started - if you don't have any ideas maybe
      try <a href='#pick-moon' onClick={pickMe}>Moon</a> {' '}
      or <a href='#pick-rover' onClick={pickMe}>Rover</a> {' '}
      or <a href='#pick-rocket' onClick={pickMe}>Rocket</a>.
    </p>
    <p>
      This service is not affiliated with Flickr or Smugmug, it just uses the Flickr
      API to help demonstrate Poppy I/O.
    </p>
  </div>
      </div>
    </div>;
}

type Search = SearchStarting | SearchResults | SearchError;

type SearchStarting = {
  state: 'starting';
  loading: true;
  hasMore: true;
}

interface SearchResults {
  loading: boolean;
  state: 'results';
  results: any[];
  totalResults: number;
  hasMore: boolean;
  loadMore(): void;
}

type SearchError = {
  state: 'error';
  message: string;
  loading: false;
  hasMore: false;
  retry: () => void;
}

function useSearch(query: string) {
  let [search, setSearch] = useState<Search>({ state: 'starting', loading: true, hasMore: true });
  useEffect(() => {
    let currentSearch = true;
    setSearch({ state: 'starting', loading: true, hasMore: true });
    let loadPage = async (previousResults: any[], page: number) => {
      try {
        if (currentSearch) setSearch(s => {
          if (s.state === 'results') {
            return {
              state: 'results',
              loading: true,
              totalResults: s.totalResults,
              results: s.results,
              hasMore: s.hasMore,
              loadMore() {}
            };
          }
          return s;
        });
        let res = await fetch('https://f4r.poppy.io/api/commons-search?c=25&p=' + page + '&q=' + encodeURIComponent(query));
        if (res.status !== 200) {
          throw new Error('HTTP ' + 200);
        }
        let { photos } = await res.json();
        let results = [...previousResults, ...photos.photo];
        let loadingMore = false;
        if (currentSearch) setSearch({
          state: 'results',
          loading: false,
          totalResults: photos.total,
          results,
          hasMore: photos.page <= photos.pages,
          loadMore() {
            if (loadingMore) return;
            loadingMore = true;
            loadPage(results, page + 1);
          }
        })
      } catch (e: any) {
        console.error(e);
        if (currentSearch) setSearch({
          state: 'error',
          message: e && e.message || 'Error',
          retry()  {
            loadPage(previousResults, page);
          },
          loading: false,
          hasMore: false
        });
      }
    };
    loadPage([], 1);
    return () => { currentSearch = false; }
  }, [query]);
  return search;
}

function SearchResults(props: {search: string}) {

  let search = useSearch(props.search);
  let [infiniteScrollRef] = useInfiniteScroll({
    hasNextPage: search.hasMore,
    loading: search.loading,
    onLoadMore: () => { if ('loadMore' in search) search.loadMore() }
  });

  let [selectedImage, setSelectedImage] = useState<any>();

  return <>
    {selectedImage ? <SelectedImage selected={selectedImage} cancel={() => setSelectedImage(null)}/> : null}
    <div style={{paddingTop: '5rem'}}>
      {search.state === 'results' ? search.results.map((res, idx) => <SearchResult result={res} key={idx} onSelect={setSelectedImage}/>) : null}
      <div ref={infiniteScrollRef} style={{textAlign: 'center', paddingBottom: '2em'}}>
        {search.loading ? 'Loading...' :
        search.state === 'error' ? ['Error: ' + search.message, <button onClick={search.retry}>Retry</button>] :
        search.state === 'results' && !search.hasMore ? `That's all ${search.results.length} results` :
        ''}
      </div>
    </div>
  </>;
}

function SearchResult(props: {result: any, onSelect: (selected: any) => void}) {
  let { result } = props;
  let thumbnailSrc = 'https://farm' + result.farm + '.static.flickr.com/' + result.server + '/' + result.id + '_' + result.secret + '_m.jpg';
  return <span onClick={() => props.onSelect(result)} className='App-imageContainer' title={result.title}><img alt={result.title} src={thumbnailSrc}/></span>;
}

function SelectedImage(props: {selected: any, cancel: () => void}) {
  let result = props.selected;
  let thumbnailSrc = 'https://farm' + result.farm + '.static.flickr.com/' + result.server + '/' + result.id + '_' + result.secret + '_m.jpg';

  let [details, setDetails] = useState<any>();
  useEffect(() => {
    fetch('https://f4r.poppy.io/api/photo-info?p=' + result.id + '&s=' + result.secret).then(async res => {
      let { photo } = await res.json();
      console.log(photo);
      setDetails(photo);
    });
  }, [props.selected]);

  return <>
    <div className='App-selectionOverlay' onClick={props.cancel}></div>
    <div className='App-selectionBox' onClick={ev => { if ((ev.target as HTMLElement).classList.contains('App-selectionBox')) props.cancel() }}>
      <div className='App-selectionBoxInner'>
        <h2>
          {result.title}
        </h2>
        <div className='App-selectionBox-options'>
          <div>
            <img src={thumbnailSrc} alt={result.title}/>
          </div>
          <p>
            <a href='#use-image' onClick={ev => {ev.preventDefault(); onSelect(details)}}>Use this image</a>
          </p>
          <p>
            <a href='#back-to-results' onClick={ev => {ev.preventDefault(); props.cancel();}}>Back to Results</a>
          </p>
          <p>
            <a href='#cancel-totally' onClick={ev => {ev.preventDefault(); ModalService.close(); }}>Cancel and Close Poppy</a>
          </p>
        </div>
        <div className='App-selectionBox-description'>
          <p>{details ? 'Source: ' + details.owner.username : 'Loading...'}</p>
          <p dangerouslySetInnerHTML={{__html:sanitizeHtml(details?.description?._content?.replace(/\n/g,'<br>') || '')}}/>
        </div>
        
      </div>
    </div>
  </>
}

async function onSelect(selection: any) {
  let download = 'https://farm' + selection.farm + '.static.flickr.com/' + selection.server + '/' + selection.id + '_' + selection.originalsecret + '_o.jpg';
  let title = selection.title;
  let description = selection.description._content;

  let req = await ModalService.getRequest();
  if (req) {
    await req.open([
      {
        offering: 'content-download',
        sending: {
          download,
          title,
          description
        }
      },
      {
        offering: 'content-blob',
        sending: async () => {
          let res = await fetch(download);
          let blob = await res.blob();
          return {
            blob,
            title,
            description
          };
        }
      }
    ]);
    ModalService.close();
  }
}

export default App
