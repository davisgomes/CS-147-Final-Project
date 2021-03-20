import {defs, tiny} from './examples/common.js';
import {Shape_From_File} from "./examples/obj-file-demo.js";
import { Body, Simulation } from "./examples/collisions-demo.js";
import {MTL_Shader} from "./mtl-shader.js";

const {
    Vector, Vector3, vec, vec3, vec4, color, hex_color, Shader, Matrix, Mat4, Light, Shape, Material, Scene, Texture, unsafe3
} = tiny;

export class Text_Line extends Shape {
    constructor(max_size) {
        super("position", "normal", "texture_coord");
        this.max_size = max_size;
        var object_transform = Mat4.identity();
        for (var i = 0; i < max_size; i++) {                                       // Each quad is a separate Square instance:
            defs.Square.insert_transformed_copy_into(this, [], object_transform);
            object_transform.post_multiply(Mat4.translation(1.5, 0, 0));
        }
    }

    set_string(line, context) {           // set_string():  Call this to overwrite the texture coordinates buffer with new
        // values per quad, which enclose each of the string's characters.
        this.arrays.texture_coord = [];
        for (var i = 0; i < this.max_size; i++) {
            var row = Math.floor(parseInt(line[i]) / 3),
                col = parseInt(line[i]) % 3;

            var skip = 3, size = 82, sizefloor = size - skip;
            var dim = 2*(size * 3),
                left = (col * size + skip)/dim, top = (row * size + skip)/dim,
                right = (col * size + sizefloor)/dim, bottom = (row * size + sizefloor)/dim;

            this.arrays.texture_coord.push(...Vector.cast([left, 1 - bottom], [right, 1 - bottom],
                [left, 1 - top], [right, 1 - top]));
        }
        if (!this.existing) {
            this.copy_onto_graphics_card(context);
            this.existing = true;
        } else
            this.copy_onto_graphics_card(context, ["texture_coord"], false);
    }
}

export class Game extends Simulation {
    /**
     *  **Base_scene** is a Scene that can be added to any display canvas.
     *  Setup the shapes, materials, camera, and lighting here.
     */
    constructor() {
        // constructor(): Scenes begin by populating initial values like the Shapes and Materials they'll need.
        super();
        this.program_state;
        this.sway = 0;
        this.thrown = false;
        this.player_turn = false;
        this.players_turn_over = 0;
        this.reset_state = false;
        this.colliders = [
            {intersect_test: Body.intersect_sphere, points: new defs.Subdivision_Sphere(3), leeway: .2},
            {intersect_test: Body.intersect_sphere, points: new defs.Subdivision_Sphere(6), leeway: .1},
            {intersect_test: Body.intersect_cube, points: new defs.Cube(), leeway: 0.05}
        ];
        this.collider_selection = 0;

        // ** Shapes **
        this.shapes = {
            axis: new defs.Axis_Arrows(),
            board: new defs.Capped_Cylinder(5, 100, [0, 1]),
            background: new defs.Square(),
            dart: new Shape_From_File('./assets/dart.obj'),
            numbers: new Text_Line(3),
            board_square: new defs.Square(),
            board_circle: new defs.Regular_2D_Polygon(2, 2)
        };

        // ** Materials **
        this.materials = {
            phong: new Material(new defs.Phong_Shader(), {
                ambient: 0.5, color: hex_color("#ffffff"),
            }),
            dart_texture: new Material(new defs.Textured_Phong(), {
                color: color(0, 0, 0, 1),
                ambient: 0.5,
                diffusivity: .5,
                specularity: .5,
                diffuseMap: 3,
                stupid: 4,
                texture: new Texture("assets/gold.jpg")
            }),
            dartboard_texture: new Material(new defs.Textured_Phong(1), {
                color: color(0, 0, 0, 1),
                ambient: 1, diffusivity: .5, specularity: .5, texture: new Texture("assets/dartboard.png")
            }),
            background_texture: new Material(new defs.Textured_Phong(1), {
                color: color(0, 0, 0, 1),
                ambient: 0.8, diffusivity: .5, specularity: .5, texture: new Texture("assets/opponent_background.png")
            }),
            wall_texture: new Material(new defs.Textured_Phong(1), {
                color: color(0, 0, 0, 1),
                ambient: 0.8, diffusivity: .5, specularity: .5, texture: new Texture("assets/wall.png")
            }),
            floor_texture: new Material(new defs.Textured_Phong(1), {
                color: color(0, 0, 0, 1),
                ambient: 0.8, diffusivity: .5, specularity: .5, texture: new Texture("assets/floor.jpg")
            }),
            ceiling_texture: new Material(new defs.Textured_Phong(1), {
                color: color(0, 0, 0, 1),
                ambient: 0.8, diffusivity: .5, specularity: .5, texture: new Texture("assets/ceiling.jpg")
            }),
            nums_texture: new Material(new defs.Textured_Phong(1), {
                ambient: 1, diffusivity: 0, specularity: 0, texture: new Texture("assets/numbers.png")
            }),
            bright: new Material(new defs.Phong_Shader(1), {color: color(0, 1, 0, .5), ambient: 1}),
            invisible: new Material(new defs.Phong_Shader(1), {color: color(1, 1, 1, 0), ambient: 1}),
            power_meter: new Material(new defs.Textured_Phong(1), {
                ambient: 1, diffusivity: 0, specularity: 0, texture: new Texture("assets/red.png")
            })
        };

        this.initial_camera_location = Mat4.look_at(vec3(0, 10, 20), vec3(0, 0, 0), vec3(0, 1, 0));
        this.spin_angle = 0;
        this.num_left = 6;
        this.thrown = false;
        this.player_score = 0;
        this.opponent_score = 0;
        this.board_center = 1.03
        this.board_values = []
        this.power_scale = 1;
        this.show_background = true
        this.view_collisions = false
    }

    make_control_panel() {
        this.key_triggered_button("Throw dart", ["j"], () => {
            if (this.num_left >= 0 && this.player_turn) this.thrown = true
        });
        this.new_line();
        this.key_triggered_button("Increase power", ["u"], () => {
            this.power_scale = Math.min(2, this.power_scale += 0.125);
        });
        this.new_line();
        this.key_triggered_button("Lower power", ["n"], () => {
            this.power_scale = Math.max(0.025, this.power_scale -= 0.125);
        });
        this.new_line();
        this.key_triggered_button("Reset", ["q"], () => {
            this.reset()
        });
        this.new_line();
        this.key_triggered_button("Toggle Dartboard View", ["t"], () => {
            this.show_background = !this.show_background
        });
        this.new_line();
        this.key_triggered_button("View Collision Boundaries", ["v"], () => {
            this.view_collisions = !this.view_collisions
        });
        this.new_line();

    }

    draw_background(context, program_state, model_transform) {
        let background_size = 4;
        model_transform = model_transform
            .times(Mat4.scale(background_size, background_size, background_size));
        this.shapes.background.draw(context, program_state, model_transform, this.materials.background_texture);
    }

    draw_walls(context, program_state, model_transform) {
        let background_size = 4;
        let wall_length = 3;

        let model_transform1 = model_transform
            .times(Mat4.translation(4, 0, 4))
            .times(Mat4.scale(background_size * wall_length, background_size, background_size))
            .times(Mat4.rotation(Math.PI / 2, 0, 1, 0));

        let model_transform2 = model_transform
            .times(Mat4.translation(-4, 0, 4))
            .times(Mat4.scale(background_size * wall_length, background_size, background_size))
            .times(Mat4.rotation(Math.PI / 2, 0, 1, 0));

        let model_transform3 = model_transform
            .times(Mat4.translation(0, -4, 4))
            .times(Mat4.scale(background_size, background_size, background_size))
            .times(Mat4.rotation(Math.PI / 2, 1, 0, 0));

        let model_transform4 = model_transform
            .times(Mat4.translation(0, 4, 4))
            .times(Mat4.scale(background_size, background_size, background_size))
            .times(Mat4.rotation(Math.PI / 2, 1, 0, 0));

        this.shapes.background.draw(context, program_state, model_transform1, this.materials.wall_texture);
        this.shapes.background.draw(context, program_state, model_transform2, this.materials.wall_texture);
        this.shapes.background.draw(context, program_state, model_transform3, this.materials.floor_texture);
        this.shapes.background.draw(context, program_state, model_transform4, this.materials.ceiling_texture);
    }

    draw_dartboard(context, program_state, model_transform) {
        let board_wh = 1.3;
        model_transform = model_transform
            .times(Mat4.scale(board_wh, board_wh, 0.5))
            .times(Mat4.translation(0, this.board_center, 1));
        this.shapes.board.draw(context, program_state, model_transform, this.materials.dartboard_texture);
    }

    draw_dart(context, program_state, model_transform) {
        let scale_size = 0.1;
        this.spin_angle = (this.spin_angle + Math.PI / 200) % (2 * Math.PI);
        model_transform = model_transform
            .times(Mat4.translation(0, 0, 10))
            .times(Mat4.scale(scale_size, scale_size, scale_size))
            .times(Mat4.rotation(Math.PI + Math.PI / 6, 1, 0, 0))
            .times(Mat4.rotation(this.spin_angle, 0, 0, 1));
        this.shapes.dart.draw(context, program_state, model_transform, this.materials.dart_texture);
    }

    draw_arsenal(context, program_state, model_transform) {
        let scale_size = 0.1;
        let start_pos = 1.3
        let span = -0.15
        for (let i = 0; i < Math.ceil(this.num_left/2); i++) {
            let model_transformi = model_transform
                .times(Mat4.translation(start_pos + i * span, -0.4, 10))
                .times(Mat4.scale(scale_size, scale_size, scale_size))
                .times(Mat4.rotation(Math.PI + Math.PI / 2, 1, 0, 0))
                .times(Mat4.rotation(this.spin_angle, 0, 0, 1));
            this.shapes.dart.draw(context, program_state, model_transformi, this.materials.dart_texture);
        }
    }

    draw_power_meter(context, program_state, model_transform) {
        model_transform = model_transform
            .times(Mat4.translation(-1.3, 0, 10)
                .times(Mat4.translation(0,-(0.6-0.6*this.power_scale/2),0))
                .times(Mat4.scale(0.1,0.6*this.power_scale/2,0))
            );
        this.shapes.background.draw(context, program_state, model_transform, this.materials.power_meter);
    }


    draw_score_and_darts_left(context, program_state, model_transform) {
        let digit_size = 0.3;
        let model_transform0 = model_transform
            .times(Mat4.translation(-1.2, -2., 0.1))
            .times(Mat4.scale(digit_size, digit_size/1.5, digit_size));
        let model_transform1 = model_transform
            .times(Mat4.translation(-1.2, -2.6, 0.1))
            .times(Mat4.scale(digit_size, digit_size/1.5, digit_size));
        let model_transform2 = model_transform
            .times(Mat4.translation(1.47, -2.22, 0.1))
            .times(Mat4.scale(digit_size, digit_size, digit_size));

        this.player_score = this.player_score;
        this.shapes.numbers.set_string(this.player_score.toString().padStart(3, '0'), context.context);
        this.shapes.numbers.draw(context, program_state, model_transform0, this.materials.nums_texture);

        this.opponent_score = this.opponent_score;
        this.shapes.numbers.set_string(this.opponent_score.toString().padStart(3, '0'), context.context);
        this.shapes.numbers.draw(context, program_state, model_transform1, this.materials.nums_texture);

        this.shapes.numbers.set_string(Math.ceil(Math.max(this.num_left/2, 0)).toString(), context.context);
        this.shapes.numbers.draw(context, program_state, model_transform2, this.materials.nums_texture);
    }

    construct_ring(radius, num_elems, scale, z_pos) {
        for (let i = 0; i < num_elems; i++) {
            let radius_x = radius * Math.cos(2 * Math.PI/num_elems * i)
            let radius_y = radius * Math.sin(2 * Math.PI/num_elems * i)

            let new_square = new Body(this.shapes.board_square, this.materials.invisible, vec3(1.4, 1.4, .2))

            new_square.emplace(Mat4.translation(radius_x, 1.35 + radius_y, z_pos)
                .times(Mat4.rotation(2 * Math.PI/num_elems * i + Math.PI/2, 0, 0, 1))
                .times(Mat4.scale(...scale)), vec3(0, 0, 0), 0);

            this.bodies.push(new_square)
        }
    }

    construct_board_elements() {
        let num_elems = 20
        let circle_values = [6, 13, 4, 18, 1, 20, 5, 12, 9, 14, 11, 8, 16, 7, 19, 3, 17, 2, 15, 10]
        let z_pos = 0.45

        // first populate outside ring
        this.construct_ring(1.03, num_elems, vec3(0.1, 0.02, 0.1), z_pos);
        this.board_values.push(...circle_values.map(function(x) { return x * 2 } ));

        // populate 2nd ring
        this.construct_ring(0.82, num_elems, vec3(0.07, 0.1, 0.1) ,z_pos);
        this.board_values.push(...circle_values);
        this.board_values.push(...circle_values.map(function(x) { return x * 3 } ));

        // populate third ring
        this.construct_ring(0.625, num_elems, vec3(0.06, 0.02, 0.1), z_pos);

        // populate fourth ring
        this.construct_ring(0.35, num_elems, vec3(0.01, 0.14, 0.1), z_pos);
        this.board_values.push(...circle_values);

        // outer circle
        let outer_circle = new Body(this.shapes.board_square, this.materials.invisible, vec3(1.4, 1.4, .2));

        outer_circle.emplace(Mat4.translation(0, 1.35, z_pos)
            .times(Mat4.scale(0.06, 0.06, 0.1)), vec3(0, 0, 0), 0);

        this.bodies.push(outer_circle);
        this.board_values.push(25);

        //inner circle
        let inner_circle = new Body(this.shapes.board_square, this.materials.invisible, vec3(1.4, 1.4, .2));

        inner_circle.emplace(Mat4.translation(0, 1.35, z_pos + 0.02)
            .times(Mat4.scale(0.03, 0.03, 0.1)), vec3(0, 0, 0), 0);

        this.bodies.push(inner_circle);
        this.board_values.push(50);
    }

    update_state(dt) {
        // update_state():  Override the base time-stepping code to say what this particular
        // scene should do to its bodies every frame -- including applying forces.
        // Generate moving bodies:
        let model_transform = Mat4.identity();
        let dart_index = 83 + (6 - this.num_left);

        //build wall
        if (this.bodies.length === 0) {
            this.bodies.push(new Body(this.shapes.background, this.materials.background_texture, vec3(4, 4, .05))
                .emplace(Mat4.translation(...vec3(0, 0, 0)),
                    vec3(0, 0, 0), 0));
        }
        // build board elements
        if (this.bodies.length === 1) {
            this.construct_board_elements()
        }
        if (this.reset_state){
            while(this.bodies.length > dart_index) {
                this.bodies.pop();
            }
            this.reset_state = false;
        }
        // build dart
        if (this.bodies.length === dart_index && this.num_left > 0) {
            console.log(this.num_left);
            this.bodies.push(new Body(this.shapes.dart, this.materials.dart_texture, vec3(.3, .3, .1))
                .emplace(Mat4.translation(...vec3(0, .5, 8)).times(Mat4.rotation(Math.PI / 6, 1, 0, 0)).times(Mat4.rotation(Math.PI, 0, 1, 0)),
                    vec3(0, 0, 0), 0));
        }

        if (this.num_left > 0) {
            if (this.player_turn) {
                if (this.thrown && this.bodies[dart_index].linear_velocity[2] === 0) {
                    this.bodies[dart_index].linear_velocity[0] = -this.sway;
                    this.bodies[dart_index].linear_velocity[1] = this.power_scale;
                    this.bodies[dart_index].linear_velocity[2] = -3;
                } else if (this.thrown) {
                    this.bodies[dart_index].linear_velocity[1] += dt * -1;
                } else if (this.num_left >= 0 && this.bodies[dart_index].linear_velocity[2] === 0) {
                    this.bodies[dart_index].emplace(Mat4.translation(...vec3(0, .5, 8)).times(Mat4.rotation(Math.PI / 6, 1, 0, 0))
                            .times(Mat4.rotation(this.sway, 0, 1, 0)).times(Mat4.rotation(Math.PI, 0, 1, 0)),
                        vec3(0, 0, 0), 0)
                }
            } else {
                if ((this.program_state.animation_time - this.players_turn_over) > 1990 && (this.program_state.animation_time - this.players_turn_over) < 2010) {
                    this.bodies[dart_index].linear_velocity[0] = -(Math.PI/12) + Math.random() * (Math.PI / 6);
                    this.bodies[dart_index].linear_velocity[1] = 1 + Math.random();
                    this.bodies[dart_index].linear_velocity[2] = -3;
                } else if ((this.program_state.animation_time - this.players_turn_over) > 2000) {
                    this.bodies[dart_index].linear_velocity[1] += dt * -1;
                }
            }
        }

        // Sometimes we delete some so they can re-generate as new ones:
        // this.bodies = this.bodies.filter(b => (Math.random() > .01) || b.linear_velocity.norm() > 1);

        // Loop through all bodies (call each "a"):
        if (this.bodies[dart_index]) {
            let a = this.bodies[dart_index]
            // Cache the inverse of matrix of body "a" to save time.
            a.inverse = Mat4.inverse(a.drawn_location);

            if (a.linear_velocity.norm() === 0)
                return;

            // *** Collision process is here ***
            // Pass the two bodies and the collision shape to check_if_colliding():

            for (let i = 0; i < dart_index; i++) {
                let collider = this.colliders[this.collider_selection];
                if (i === 0) {
                    collider = this.colliders[1];
                }

                if (!a.check_if_colliding(this.bodies[i], collider))
                    continue;
                // If we get here, we collided, so turn red and zero out the
                // velocity so they don't inter-penetrate any further.
                a.linear_velocity = vec3(0, 0, 0);
                a.angular_velocity = 0;
                this.num_left -= 1;
                if (this.player_turn) {
                    this.thrown = false;
                    this.players_turn_over = this.program_state.animation_time;
                    this.player_turn = false;
                } else {
                    this.player_turn = true;
                }

                if (i !== 0) {
                    this.increase_score(this.board_values[i - 1]);
                }
                console.log(i)
                break;
            }
        }
    }

    display(context, program_state) {
        this.program_state = program_state;
        this.sway = (Math.PI/8)*Math.sin(Math.PI*(this.program_state.animation_time/5000));
        super.display(context, program_state);
        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
            // Define the global camera and projection matrices, which are stored in program_state.
            program_state.set_camera(Mat4.translation(0, 0, -12));
            // for testing
            //program_state.set_camera(Mat4.translation(0, -1.3, -3.5));
        }

        program_state.projection_transform = Mat4.perspective(
            Math.PI / 4, context.width / context.height, 1, 100);

        const light_position = vec4(10, 10, -12, 1);
        program_state.lights = [new Light(light_position, color(1, 1, 1, 1), 1000)];

        let model_transform = Mat4.identity();
        this.draw_walls(context, program_state, model_transform);

        if (this.show_background) {
            //this.draw_background(context, program_state, model_transform);
            this.draw_dartboard(context, program_state, model_transform);
        }
        //this.draw_dart(context, program_state, model_transform);
        this.draw_score_and_darts_left(context, program_state, model_transform);
        this.draw_arsenal(context, program_state, model_transform);
        this.draw_power_meter(context, program_state, model_transform);

        // Draw an extra bounding sphere around each drawn shape to show
        // the physical shape that is really being collided with:
        if (this.view_collisions) {
            const {points, leeway} = this.colliders[this.collider_selection];
            const size = vec3(1 + leeway, 1 + leeway, 1 + leeway);
            for (let b of this.bodies)
                points.draw(context, program_state, b.drawn_location.times(Mat4.scale(...size)), this.materials.bright, "LINE_STRIP");
        }

    }

    increase_score(num_points) {
        if (this.player_turn) {
            this.player_score += num_points;
        } else {
            this.opponent_score += num_points;
        }
    }

    reset() {
        this.player_score = 0;
        this.opponent_score = 0;
        this.num_left = 6;
        this.sway = 0;
        this.thrown = false;
        this.player_turn = false;
        this.players_turn_over = this.program_state.animation_time;
        this.reset_state = true;
    }
}