export class WorkLimiter {
  private active=0;
  private waiting:(()=>void)[]=[];
  constructor(private concurrency=2,private queueLimit=8) {}
  async run<T>(work:()=>Promise<T>):Promise<T> {
    if(this.active>=this.concurrency) {
      if(this.waiting.length>=this.queueLimit)throw new Error('The local DM is busy. Please try again shortly.');
      await new Promise<void>(resolve=>this.waiting.push(resolve));
    }else this.active++;
    try{return await work();}
    finally{const next=this.waiting.shift();if(next)next();else this.active--;}
  }
}
