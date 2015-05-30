//rcp_js the rcp client for java script.
//by Kent Nakajima.

var rcpJS = {};// As namespace

(function(){
 
 
 	rcpJS.rcpConnection = function(){
		var that = this;
		var con = {};

		con.onopen = function(){}
		con.onclose = function(){}
		con.onmessage = function(){}
		con.onerror = function(){}

		//--temp context impl
		var ctx = {};
		ctx.local_site = {};
		ctx.neighbors = [];

		//Upgrade to plain big text context.
		ctx = NewContext(ctx);
		ctx.local_site = {};
		ctx.on_init_local_site(ctx.local_site);
		con.context = ctx;
		//--end

		var wsOnopen= function(event){
			con.onopen();

			//--temp context impl
			var site = {};
			site.send = function(cmd){
				//that.websock.send(cmd);
				con.sendCommand(0x81, cmd);
			}
			site.is_slave = false;
			ctx.on_init_neighbor_site(site);
			ctx.neighbors.push(site);
			//--end
		}
		var wsOnerror= function(event){
			con.onerror();
		}
		var wsOnclose= function(event){
			con.onclose(event);
		}
		var wsOnBinalyMessage = function(event){
			var data = event.data;
			var view = new DataView(data);
			var ptr = 0;
			var opcode = view.getUint8(0);
			ptr += 1;

			var length = view.getUint8(1);
			ptr += 1;

			if (length == 0xfe){
				if (data.length<0xfe){
					console.log("fatal:bad length encoding");
					return;//fatal error
				}
				length = view.getUint16(2, false);
				ptr += 2;
			}
			else if (length == 0xff){
				if (data.length<0x10000){
					console.log("fatal:bad length encoding");
					return;//fatal error
				}
				length = view.getUint64(2, false);
				ptr += 8;
			}

			if (data.byteLength != ptr + length){
				console.log("fatal");
			}
			var command = data.slice(ptr);
			con.onmessage(command);

			//--temp context impl
			ctx.execute_command(command, ctx.neighbors[0]);
			//--end
		}
		var wsOnmessage = function(event){
			var data = event.data;
			if (data instanceof ArrayBuffer){
				wsOnBinalyMessage(event);
				//console.log(event.data);
			}
			con.onmessage(event.data);
		}


		con.connectToURL = function(url){
			that.websock = new WebSocket(url);
			that.websock.binaryType = "arraybuffer";
			that.websock.onmessage = wsOnmessage;
			that.websock.onopen= wsOnopen;
			that.websock.onclose= wsOnclose;
			that.websock.onerror= wsOnerror;
		}

		con.sendAsRawData = function(string){
			that.websock.send(string);
		}


		var lengthOfLength = function(l){
			if (l<0xfe)
				return 1;
			else if (l<0x10000)
				return 3;
			else
				return 9;
		}

		var setLengthOfLength = function(dataView, offset, l){
			if (l<0xfe){
				dataView.setUint8(offset, l);
			}
			else if (l<0x10000){
				dataView.setUint8(offset, 0xFE);
				dataView.setUint16(offset+1, l, false);
			}
			else if (l<(1<<32)){
				dataView.setUint8(offset, 0xFF);
				dataView.setUint32(offset+1, 0, false);
				dataView.setUint32(offset+5, l, false);
			}
		}

		con.sendCommand = function(command_id, payload){
			var header_length = 1 + lengthOfLength(payload.byteLength);
			var buffer = new ArrayBuffer(header_length+payload.byteLength);
			var view = new DataView(buffer);

			//command id
			view.setUint8(0, command_id);

			//command length
			setLengthOfLength(view, 1, payload.byteLength);

			memcpy(view, header_length, new Uint8Array(payload));

			that.websock.send(buffer);
			/*
			var encoded_str = TextEncoder("UTF8").encode("text");
			var str_view = new Uint8Array(buffer, 2, 4);
			var i;
			for (i = 0; i<4; i++)
				str_view[i] = encoded_str[i];
			
			that.websock.send(buffer);
			*/
		}

		var memcpy = function(dst, dst_offset, src){
			//dst.set(dst_offset, src);
			for (var i = 0; i<src.length; i++){
				dst.setUint8(dst_offset+i, src[i]);
			}
		}
		var putVString = function(dataView, offset, str_buffer){
			setLengthOfLength(dataView, offset, str_buffer.length);
			offset += lengthOfLength(str_buffer.length);
			//dataView.set(offset, str_buffer);

			//for (var i = 0; i<str_buffer.length; i++){
				//dataView.setUint8(offset+i, str_buffer[i]);
			//}
			memcpy(dataView, offset, str_buffer);
			return offset + str_buffer.length;
		}

		con.loginUser= function(name, password){
			var encoded_name = TextEncoder("UTF8").encode(name);
			var encoded_password = TextEncoder("UTF8").encode(password);

			var total_length = 0;
			total_length += encoded_name.length;
			total_length += encoded_password.length;
			total_length += lengthOfLength(encoded_name.length);
			total_length += lengthOfLength(encoded_password.length);

			var buffer = ArrayBuffer(
					1+lengthOfLength(total_length)+total_length);
			var view = new DataView(buffer);

			var offset = 0;
			view.setUint8(offset, 0x14);
			offset += 1;

			setLengthOfLength(view, offset, total_length);
			offset+= lengthOfLength(total_length);
			
			offset = putVString(view, offset, encoded_name);
			offset = putVString(view, offset, encoded_password);
			
			that.websock.send(buffer);
		}
		
//for debug
		con.sendOpen = function(str){
			var buffer = new ArrayBuffer(2);
			var view = new DataView(buffer);
			view.setUint8(0, 0x00);
			view.setUint8(1, 0x00);
			that.websock.send(buffer);
		}
		con.ping = function(){
			con.sendCommand(0x0A, new ArrayBuffer(0));
		}

		//con.sendContents = function(str){
			//var buffer = new ArrayBuffer(8);
			//var view = new DataView(buffer);
			//view.setUint8(0, 0x81);
			//view.setUint8(1, 0x06);
			//view.setUint16(2, 0x00);
			//view.setUint16(4, 0x00);
			//view.setUint16(6, 0x00);
			//that.websock.send(buffer);
		//}
		con.sendString= function(str){
			var encoded_str = new TextEncoder("UTF8").encode(str);

			var total_length = 0;
			total_length += encoded_str.length;

			var buffer = ArrayBuffer(
					1+lengthOfLength(total_length)+total_length);
			var view = new DataView(buffer);

			var offset = 0;
			view.setUint8(offset, 0x70);
			offset += 1;

			setLengthOfLength(view, offset, total_length);
			offset+= lengthOfLength(total_length);

			memcpy(view, offset, encoded_str);
			
			that.websock.send(buffer);
		}

		return con;
	}
}
)()

