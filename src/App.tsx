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
        let match = req.matching.find(i => i.side === 'accepting' && i.form === 'content-download');
        if (match) {
          setRequest(req);
          setRequestStatus('All good - sending a content-download to ' + match.origin);
        } else {
          setRequestStatus('(This page is open in a poppy, but the client request is not compatible - this page is offering a content-download)');
        }
      } else {
        setRequestStatus('(It does not appear this page is open in a poppy - no request was detected)');
      }
    });
  }, []);

  return (
    <div className='App'>
      <div className='App-header'>
        <h1 className='App-headerItem'>Commons Picker</h1>
        <form className='App-headerItem' onSubmit={ev => ev.preventDefault()}>
          <label htmlFor="searchInput">Search: </label>
          <input value={search} id="searchInput" autoFocus type="text" onChange={updateSearch} />
        </form>
        <div className='App-headerItem'>
          <button onClick={() => ModalService.close()}>Cancel - Close Poppy</button>
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
      <div style={{margin:'auto', maxWidth: '40rem'}}>
    <p>
      This page is a Poppy I/O Service that lets you
      pick an image from the Flickr Commons, a collection of free
      archival images with no known copyright restrictions, and then
      send it back to the client page that opened it. {props.requestStatus}
    </p>
    <p>
      Type in a
      search above to get started - if you don't have any ideas maybe
      try <a href='#' onClick={pickMe}>Moon</a> or <a href='#' onClick={pickMe}>Rover</a> or <a href='#' onClick={pickMe}>Saturn</a>.
    </p>
    <p>
      This service is not affiliated with Flickr or Smugmug, it just uses the Flickr
      API to help demonstrate Poppy I/O.
    </p>
  </div>
      </div>
    </div>;
}

function SearchResults(props: {search: string}) {
  console.log(props.search);
  let [page, setPage] = useState(1);
  let [totalResults, setTotalResults] = useState(Number.MAX_SAFE_INTEGER);
  let [results, setResults] = useState<any[]>([]);
  let [loading, setLoading] = useState(false);
  let [selectedImage, setSelectedImage] = useState<any>();

  let onLoadMore = async (specificPage?: number) => {
    setLoading(true);
    console.log('Fetch ' + specificPage || page);
    let res = await fetch('https://f4r.poppy.io/api/commons-search?c=25&p=' + (specificPage||page) + '&q=' + encodeURIComponent(props.search));
    let { photos } = await res.json();
    setTotalResults(photos.total);
    setResults([...results, ...photos.photo]);
    setPage(page + 1);
    setLoading(false);
  };

  let [infiniteScrollRef] = useInfiniteScroll({
    hasNextPage: results.length < totalResults,
    loading,
    onLoadMore
  });

  useEffect(() => { 
    setResults([]);
    setPage(1);
    onLoadMore()
  }, [props.search]);

  return <>
    {selectedImage ? <SelectedImage selected={selectedImage} cancel={() => setSelectedImage(null)}/> : null}
    <div style={{paddingTop: '3rem'}}>
      {results.map((res, idx) => <SearchResult result={res} key={idx} onSelect={setSelectedImage}/>)}
      <div ref={infiniteScrollRef}>
        {loading ? 'Loading...' : ''}
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
    <div className='App-selectionBox' onClick={ev => { if (ev.currentTarget.classList.contains('App-selectionBox')) props.cancel() }}>
      <div className='App-selectionBoxInner'>
        <h2>
          {result.title}
        </h2>
        <div style={{float: 'left', padding: '1rem'}}>
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
            <a href='#cancel-totally' onClick={ev => {ev.preventDefault(); ModalService.close(); }}>Cancel and Return to App</a>
          </p>
        </div>
        <div>
          <p>{details ? 'From ' + details.owner.username : 'Loading...'}</p>
          <p dangerouslySetInnerHTML={{__html:sanitizeHtml(details?.description?._content?.replace(/\n/g,'<br>') || '')}}/>
        </div>
      </div>
    </div>
  </>
}

async function onSelect(selection: any) {
  let req = await ModalService.getRequest();
  if (req) {
    await req.open({
      offering: 'content-download',
      sending: {
        download: 'https://farm' + selection.farm + '.static.flickr.com/' + selection.server + '/' + selection.id + '_' + selection.originalsecret + '_o.jpg',
        title: selection.title,
        description: selection.description._content,
      }
    });
    ModalService.close();
  }
}

export default App
