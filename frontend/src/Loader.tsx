export function Loader({label,inline=false}:{label:string;inline?:boolean}){
 return <span className={inline?'loadingIndicator':'loadingIndicator loadingBlock'} role="status"><span className="loadingSpinner" aria-hidden="true"/>{label}</span>;
}
