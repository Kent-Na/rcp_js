"use strict";
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

		var reader = BSP.reader();

		var wsOnopen= function(event){
			//--temp context impl
			var site = {};
			site.send = function(cmd){
				//that.websock.send(cmd);
				con.sendCommand(0x01, cmd);
			}
			site.is_slave = false;
			ctx.on_init_neighbor_site(site);
			ctx.neighbors.push(site);
			//--end

			reader.set_next_procedure(f_0);

			//send open frame.
			var open = new Uint8Array(256);
			this.send(open);

			//send login user
			var login_user = {
				//tag:command.tag.login_user,
				tag:rcp_command.command_tag.login_user_request,
				body:{
					user_name:"testuser",
					domain:"www.tuna-cat.com",
					plain_password:"testpass"
				}
			};
			encode_and_send_command(login_user, this);

			var login_context = {
				tag:rcp_command.command_tag.login_context_request,
				body:{
					context_id:"58D23E23-3D57-41F6-B973-34B2625DA4B6"
					//context_id:"D3F66A72-0631-4955-A9CD-4D5BCD86E77D"
			    }
			}
			encode_and_send_command(login_context, this);

			con.onopen();
		}

		con.force_store = function(){
			var command = {
				tag:rcp_command.command_tag.force_store,
				body:{
					context_id:"58D23E23-3D57-41F6-B973-34B2625DA4B6"
			    }
			}
			encode_and_send_command(command, that.websock);

			var command = {
				tag:rcp_command.command_tag.force_store,
				body:{
					context_id:"D3F66A72-0631-4955-A9CD-4D5BCD86E77D"
			    }
			}
			encode_and_send_command(command, that.websock);
		}

		con.create_context = function(){
			var command = {
				tag:rcp_command.command_tag.create_context_request,
				body:{
					driver:"json.driver.tuna-cat.com"
			    }
			}
			encode_and_send_command(command, that.websock);
		}
		con.ping = function(){
			//doto:implement this.
		}

		var wsOnerror= function(event){
			con.onerror(event);
		}
		var wsOnclose= function(event){
			con.onclose(event);
		}

		var context_for_pipe_id = function(pipe_id){
			return ctx;
		}
		var site_for_pipe_id = function(pipe_id){
			return ctx.neighbors[0];
		}
		var encode_and_send_command = function(command, ws){
			var state_header = {}
			var state_payload = {}
			var s_payload = rcp_command.sizeof_command(
					command, state_payload);
			var frame_header = {
				payload_length : s_payload,
				pipe_id : 0,
			};
			var s_header = rcp_command.sizeof_frame_header(
					frame_header, state_header);
			var output_buffer = new ArrayBuffer(s_header+s_payload);
			var output = new DataView(output_buffer);
			rcp_command.frame_header_write(
					frame_header, state_header, output, 0);
			rcp_command.command_write(
					command, state_payload, output, s_header);
			ws.send(output);
		}
		con.sendCommand = function(pipe_id, payload){
			var state_header = {}
			var s_payload = payload.byteLength;

			var frame_header = {
				payload_length : s_payload,
				pipe_id : pipe_id,
			};
			var s_header = rcp_command.sizeof_frame_header(
					frame_header, state_header);
			var output_buffer = new ArrayBuffer(s_header+s_payload);
			var output = new DataView(output_buffer);
			rcp_command.frame_header_write(
					frame_header, state_header, output, 0);
			BSP.memcpy(payload, 0, output, s_header, s_payload);
			that.websock.send(output);
		}

		//Reader procedures
		var f_0 = function(reader){
			var input = reader.input();
			//var size = 256;
			//if (!input.is_ready(size)){
				//reader.set_require_more_data();
				//return
			//}
			//var open_f = input.getArrayBuffer(size);
			reader.set_next_procedure(f_header_push);
		}
		var f_header_push = function(reader){
			var header = rcp_command.frame_header_construct();
			reader.push_stack(header, null);
			reader.push_stack(header, f_header_pop);
			reader.set_next_procedure(rcp_command.frame_header_reader);
		}
		var f_header_pop = function(reader){
			var header = reader.output();
			console.log(reader.output());
			reader.pop_stack();
			if (header.pipe_id == 0){
				reader.set_next_procedure(f_main_push);
			}
			else{
				var ctx = context_for_pipe_id(header.pipe_id);
				if (ctx !== null){
					reader.set_next_procedure(
							f_context_frame(
								header.pipe_id, 
								header.payload_length));
				}
				else{
					reader.set_next_procedure(
							f_void_frame(
								header.payload_length));
				}
			}
		}
		var f_void_frame = function(size){
			return function(reader){
				var input = reader.input();
				if (!input.is_ready(size)){
					reader.ret_require_more_data();
					return;
				}
				input.getArrayBuffer(size);
				reader.set_next_procedure(f_header_push);
			}
		}
		var f_context_frame = function(pipe_id, size){
			return function(reader){
				var input = reader.input();
				if (!input.is_ready(size)){
					reader.ret_require_more_data();
					return;
				}
				var frame = input.getArrayBuffer(size);
				var site = site_for_pipe_id(pipe_id);
				var context = context_for_pipe_id(pipe_id);
				context.execute_command(frame, site);
				reader.set_next_procedure(f_header_push);
			}
		}

		var f_main_push = function(reader){
			var command = rcp_command.command_construct();
			reader.push_stack(command, null);
			reader.push_stack(command, f_main_pop);
			reader.set_next_procedure(rcp_command.command_reader);
		}

		var f_main_pop = function(reader){
			console.log(reader.output());
			reader.set_next_procedure(f_header_push);
		}
		//End of reader procedures

		var wsOnBinalyMessage = function(event){
			reader.push_input_data(event.data);
			reader.process();
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

		return con;
	}
}
)()

